import type { Pool } from 'pg';
import type { Skill } from '../types/task.js';

/** All Skills (REQ-2.8), ordered by id for a stable response. */
export async function getAllSkills(pool: Pool): Promise<Skill[]> {
  const { rows } = await pool.query<Skill>('SELECT id, name FROM skills ORDER BY id');
  return rows;
}

/**
 * Of the given skill ids, returns the ones that do not exist (in the same
 * order they were passed in). Used by `POST /tasks` to reject an unknown
 * skill id with `400` before any row is written. An empty input short-circuits
 * to `[]` without a round trip — `= ANY($1)` against an empty array would
 * otherwise still need to run and would trivially return nothing missing.
 */
export async function findMissingSkillIds(pool: Pool, skillIds: number[]): Promise<number[]> {
  if (skillIds.length === 0) return [];

  const { rows } = await pool.query<{ id: number }>('SELECT id FROM skills WHERE id = ANY($1)', [
    skillIds,
  ]);
  const found = new Set(rows.map((r) => r.id));
  return skillIds.filter((id) => !found.has(id));
}
