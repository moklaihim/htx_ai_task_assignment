import type { Pool } from 'pg';
import type { Skill } from '../types/task.js';

/** All Skills (REQ-2.8), ordered by id for a stable response. */
export async function getAllSkills(pool: Pool): Promise<Skill[]> {
  const { rows } = await pool.query<Skill>('SELECT id, name FROM skills ORDER BY id');
  return rows;
}
