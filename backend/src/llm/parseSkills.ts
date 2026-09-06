import type { Skill } from '../types/task.js';

/**
 * One classification outcome (design §5.2, REQ-6.5, REQ-6.8).
 *
 * `classifiable: false` is a *successful* call whose answer is "this title is
 * not a software task" — a third state alongside "classified" and "the call
 * failed", and deliberately not modelled as an error. Titles are free text, so
 * "buy eggs" is an ordinary input, and treating the model's correct answer for
 * it as a failure is what made the frontend report an error where none had
 * happened.
 */
export type SkillInference =
  | { classifiable: true; skillIds: number[] }
  | { classifiable: false };

/**
 * Turns the model's raw response text into seeded `skills.id` values
 * (design §5.2, REQ-6.5).
 *
 * This is the gate that keeps invented skills out of the database. Whatever the
 * model returns, only names that match a row already in `skills` survive; an
 * unrecognised name is **dropped**, never created. The fixed `Frontend`/
 * `Backend` set is what the assignment rule in design §4.2 is built on — a task
 * requiring a skill no developer can hold would be permanently unassignable —
 * and `task_skills.skill_id` is a foreign key, so an invented name would in any
 * case only surface later as a constraint violation mid-transaction.
 *
 * Throws on anything that isn't a usable classification (design §5.3). The
 * caller treats a throw here exactly like a network failure: no skills, and
 * `skillInferenceFailed: true` on that node (REQ-6.4, REQ-6.6). A returned
 * `{ classifiable: false }` is **not** a throw — see REQ-6.8.
 */
export function parseSkillInference(rawText: string, seededSkills: Skill[]): SkillInference {
  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(`unparseable JSON: ${truncate(rawText)}`);
  }

  const response = extractResponse(payload);
  if (response === null) {
    throw new Error(`unexpected response shape: ${truncate(rawText)}`);
  }

  // The flag wins over the array. A model that says "not a task" and then lists
  // a skill anyway has contradicted itself, and of the two answers the refusal
  // is the one it was asked to decide first (design §5.2) — and the one that
  // cannot put a wrong skill on a task.
  if (!response.classifiable) {
    return { classifiable: false };
  }

  // Lower-cased lookup: the schema's enum pins the casing in practice, but a
  // "frontend" that only differs in case is unambiguously the seeded skill,
  // and dropping it would lose a correct classification on a technicality.
  const byName = new Map(seededSkills.map((skill) => [skill.name.trim().toLowerCase(), skill.id]));

  const skillIds: number[] = [];
  for (const name of response.names) {
    const id = byName.get(name.trim().toLowerCase());
    // Unrecognised (or duplicated) names are silently discarded — this is the
    // "model-invented skills never reach the database" guarantee.
    if (id !== undefined && !skillIds.includes(id)) {
      skillIds.push(id);
    }
  }

  if (skillIds.length === 0) {
    // "Classifiable, but no valid skill names" is a failure per design §5.3:
    // the model claimed the title is a software task and then named nothing we
    // can act on, which leaves the task exactly as unclassified as a network
    // error does. The honest "not a task" answer is the branch above; this one
    // is a self-contradiction and is reported as such (REQ-6.6).
    throw new Error(`no valid skill names in response: ${truncate(rawText)}`);
  }

  return { classifiable: true, skillIds };
}

/**
 * The response's two fields, or `null` if the payload isn't shaped like a
 * classification at all. Non-string entries in `skills` are ignored rather than
 * rejecting the whole response — a usable `["Frontend", 7]` still classifies.
 *
 * A missing `classifiable` is read as `true`, so a response carrying only
 * `skills` still classifies. The response schema (design §5.2) marks the field
 * required, so this only covers a model that ignores its schema — and for that
 * model the old behaviour, "classify what you were given", is the safer of the
 * two readings: defaulting to `false` instead would silently turn every such
 * response into "not a task" and drop skills it did return.
 */
function extractResponse(payload: unknown): { classifiable: boolean; names: string[] } | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const { skills, classifiable } = payload as { skills?: unknown; classifiable?: unknown };
  if (!Array.isArray(skills)) {
    return null;
  }

  return {
    classifiable: typeof classifiable === 'boolean' ? classifiable : true,
    names: skills.filter((entry): entry is string => typeof entry === 'string'),
  };
}

/** Keeps a bad response quotable in a one-line server log. */
function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 120)}…` : collapsed;
}
