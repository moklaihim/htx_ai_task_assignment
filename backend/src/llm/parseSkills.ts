import type { Skill } from '../types/task.js';

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
 * `skillInferenceFailed: true` on that node (REQ-6.4, REQ-6.6).
 */
export function parseSkillIds(rawText: string, seededSkills: Skill[]): number[] {
  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(`unparseable JSON: ${truncate(rawText)}`);
  }

  const names = extractSkillNames(payload);
  if (names === null) {
    throw new Error(`unexpected response shape: ${truncate(rawText)}`);
  }

  // Lower-cased lookup: the schema's enum pins the casing in practice, but a
  // "frontend" that only differs in case is unambiguously the seeded skill,
  // and dropping it would lose a correct classification on a technicality.
  const byName = new Map(seededSkills.map((skill) => [skill.name.trim().toLowerCase(), skill.id]));

  const ids: number[] = [];
  for (const name of names) {
    const id = byName.get(name.trim().toLowerCase());
    // Unrecognised (or duplicated) names are silently discarded — this is the
    // "model-invented skills never reach the database" guarantee.
    if (id !== undefined && !ids.includes(id)) {
      ids.push(id);
    }
  }

  if (ids.length === 0) {
    // "JSON with no valid skill names" is a failure per design §5.3: the point
    // of REQ-6.1 is that a task created without skills gets some, so a response
    // that yields none has not achieved that and the user should be told
    // (REQ-6.6) rather than silently handed an unclassified task.
    throw new Error(`no valid skill names in response: ${truncate(rawText)}`);
  }

  return ids;
}

/**
 * The `skills` array as strings, or `null` if the payload isn't shaped like a
 * classification at all. Non-string entries are ignored rather than rejecting
 * the whole response — a usable `["Frontend", 7]` still classifies.
 */
function extractSkillNames(payload: unknown): string[] | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return null;
  }

  const { skills } = payload as { skills?: unknown };
  if (!Array.isArray(skills)) {
    return null;
  }

  return skills.filter((entry): entry is string => typeof entry === 'string');
}

/** Keeps a bad response quotable in a one-line server log. */
function truncate(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > 120 ? `${collapsed.slice(0, 120)}…` : collapsed;
}
