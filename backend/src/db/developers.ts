import type { Pool } from 'pg';
import type { Developer } from '../types/developer.js';
import { toDeveloper, type DbDeveloperRow } from './mapping.js';

// Skills and assigned tasks are each pulled by a correlated subquery rather
// than a join (see DbDeveloperRow) — a developer has two independent
// one-to-many relations off the same row, and joining both directly would
// cross-multiply every skill against every assigned task.
const SELECT_DEVELOPER = `
  SELECT
    d.id,
    d.name,
    COALESCE(
      (SELECT json_agg(json_build_object('id', s.id, 'name', s.name) ORDER BY s.id)
       FROM developer_skills ds
       JOIN skills s ON s.id = ds.skill_id
       WHERE ds.developer_id = d.id),
      '[]'
    ) AS skills,
    COALESCE(
      (SELECT json_agg(json_build_object('id', t.id, 'title', t.title, 'status', t.status) ORDER BY t.id)
       FROM tasks t
       WHERE t.assignee_id = d.id),
      '[]'
    ) AS assigned_tasks
  FROM developers d
`;

/** All Developers, each with their skills and assigned tasks (REQ-2.6). */
export async function getAllDevelopers(pool: Pool): Promise<Developer[]> {
  const { rows } = await pool.query<DbDeveloperRow>(`${SELECT_DEVELOPER} ORDER BY d.id`);
  return rows.map(toDeveloper);
}

/** One Developer by id, or `null` if no such developer exists (REQ-2.7). */
export async function getDeveloperById(pool: Pool, id: number): Promise<Developer | null> {
  const { rows } = await pool.query<DbDeveloperRow>(`${SELECT_DEVELOPER} WHERE d.id = $1`, [id]);
  return rows[0] ? toDeveloper(rows[0]) : null;
}
