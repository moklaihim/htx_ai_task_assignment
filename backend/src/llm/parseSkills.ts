import type { Skill } from '../types/task.js';

/**
 * One classification outcome (design §5.2, REQ-6.5, REQ-6.8).
 *
 * `classifiable: false` is a *successful* call whose answer is "this title is
 * not a software task" — a third state alongside "classified" and "the call
 * failed", deliberately not modelled as an error, since titles are free text
 * and "buy eggs" is an ordinary input.
 */
export type SkillInference =
  | { classifiable: true; skillIds: number[] }
  | { classifiable: false };

/**
 * Turns the model's raw response text into seeded `skills.id` values
 * (design §5.2, REQ-6.5).
 *
 * This is the gate that keeps invented skills out of the database: only names
 * that match a row already in `skills` survive, and an unrecognised name is
 * **dropped**, never created.
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

  // The flag wins over the array: a model that says "not a task" and then
  // lists a skill anyway has contradicted itself, and the refusal is the
  // safer of the two answers to trust.
  if (!response.classifiable) {
    return { classifiable: false };
  }

  // Lower-cased lookup so a "frontend" that only differs in case still
  // matches the seeded skill.
  const byName = new Map(seededSkills.map((skill) => [skill.name.trim().toLowerCase(), skill.id]));

  const skillIds: number[] = [];
  for (const name of response.names) {
    const id = byName.get(name.trim().toLowerCase());
    // Unrecognised (or duplicated) names are silently discarded.
    if (id !== undefined && !skillIds.includes(id)) {
      skillIds.push(id);
    }
  }

  if (skillIds.length === 0) {
    // "Classifiable, but no valid skill names" is a failure per design §5.3:
    // a self-contradiction, reported as such (REQ-6.6).
    throw new Error(`no valid skill names in response: ${truncate(rawText)}`);
  }

  return { classifiable: true, skillIds };
}

/**
 * The response's two fields, or `null` if the payload isn't shaped like a
 * classification at all. Non-string entries in `skills` are ignored rather
 * than rejecting the whole response — a usable `["Frontend", 7]` still
 * classifies.
 *
 * A missing `classifiable` is read as `true`, so a response carrying only
 * `skills` still classifies. The response schema (design §5.2) marks the
 * field required, so this only covers a model that ignores its schema, where
 * "classify what you were given" is the safer reading of the two.
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
