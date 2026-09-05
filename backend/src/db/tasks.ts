import type { Pool } from 'pg';
import type { TaskRow, TaskStatus } from '../types/task.js';
import { toTaskRow, type DbTaskRow } from './mapping.js';

// Shared by both queries below (design §4.4): given whichever set of root rows
// the anchor term selects, walk `parent_task_id` down to full depth and fold
// each task's skills into one JSON array with `json_agg … FILTER`, so a task
// with none becomes `[]` rather than `[null]`.
const SELECT_TREE = `
  SELECT tree.id, tree.title, tree.status, tree.parent_task_id,
         d.id AS assignee_id, d.name AS assignee_name,
         COALESCE(
           json_agg(json_build_object('id', s.id, 'name', s.name))
             FILTER (WHERE s.id IS NOT NULL),
           '[]'
         ) AS skills
  FROM tree
  LEFT JOIN developers  d  ON d.id  = tree.assignee_id
  LEFT JOIN task_skills ts ON ts.task_id = tree.id
  LEFT JOIN skills      s  ON s.id  = ts.skill_id
  GROUP BY tree.id, tree.title, tree.status, tree.parent_task_id, d.id, d.name
`;

/**
 * Every task belonging to a top-level tree (`GET /tasks`, REQ-2.2). Anchored
 * on `parent_task_id IS NULL` so every root and all of its descendants, at any
 * depth, come back in one round trip — `buildForest` nests them afterwards.
 */
export async function getAllTaskRows(pool: Pool): Promise<TaskRow[]> {
  const { rows } = await pool.query<DbTaskRow>(`
    WITH RECURSIVE tree AS (
      SELECT * FROM tasks WHERE parent_task_id IS NULL
      UNION ALL
      SELECT t.* FROM tasks t JOIN tree ON t.parent_task_id = tree.id
    )
    ${SELECT_TREE}
  `);
  return rows.map(toTaskRow);
}

/**
 * The task `id` and every descendant beneath it, at any depth (`GET /tasks/:id`,
 * REQ-2.3). Returns `[]` when no task with that id exists — the route turns
 * that into a 404 rather than an empty tree.
 */
export async function getTaskTreeRows(pool: Pool, id: number): Promise<TaskRow[]> {
  const { rows } = await pool.query<DbTaskRow>(
    `
    WITH RECURSIVE tree AS (
      SELECT * FROM tasks WHERE id = $1
      UNION ALL
      SELECT t.* FROM tasks t JOIN tree ON t.parent_task_id = tree.id
    )
    ${SELECT_TREE}
  `,
    [id],
  );
  return rows.map(toTaskRow);
}

/**
 * Sets (or clears, when `assigneeId` is `null`) a task's assignee (`PATCH
 * /tasks/:id/assign`, REQ-2.4). The caller is responsible for having already
 * validated the skill match — this function performs the write only.
 */
export async function updateTaskAssignee(
  pool: Pool,
  id: number,
  assigneeId: number | null,
): Promise<void> {
  await pool.query('UPDATE tasks SET assignee_id = $2 WHERE id = $1', [id, assigneeId]);
}

/**
 * Sets a task's status (`PATCH /tasks/:id/status`, REQ-2.5 — partial: the
 * caller is responsible for the recursive Done-rule check once subtasks exist
 * (phase 5); this function performs the write only.
 */
export async function updateTaskStatus(pool: Pool, id: number, status: TaskStatus): Promise<void> {
  await pool.query('UPDATE tasks SET status = $2 WHERE id = $1', [id, status]);
}

/**
 * Inserts a single, flat task (no subtasks — that arrives in phase 5) and its
 * `task_skills` rows in one transaction, so a failure part-way (e.g. a bad
 * skill id that slipped past validation) leaves neither behind. Returns the
 * new task's id; callers re-read the full row via `getTaskTreeRows` to reuse
 * the same mapping/shape as every other endpoint (design §4.5).
 */
export async function insertFlatTask(pool: Pool, title: string, skillIds: number[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<{ id: number }>(
      'INSERT INTO tasks (title) VALUES ($1) RETURNING id',
      [title],
    );
    const taskId = rows[0]!.id;

    for (const skillId of skillIds) {
      await client.query('INSERT INTO task_skills (task_id, skill_id) VALUES ($1, $2)', [
        taskId,
        skillId,
      ]);
    }

    await client.query('COMMIT');
    return taskId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
