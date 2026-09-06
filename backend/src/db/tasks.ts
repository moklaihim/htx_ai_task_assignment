import type { Pool, PoolClient } from 'pg';
import type { TaskRow, TaskStatus } from '../types/task.js';
import type { CreateTaskRequest } from '../schemas/task.js';
import { toTaskRow, type DbTaskRow } from './mapping.js';

// Shared by both queries below: given whichever root rows the anchor term
// selects, walk `parent_task_id` down to full depth and fold each task's
// skills into one JSON array with `json_agg … FILTER`, so a task with none
// becomes `[]` rather than `[null]`.
//
// `ORDER BY tree.id` makes the response deterministic — a recursive CTE has
// no defined row order, and `buildForest` preserves whatever order it's
// given. Ordering by id means creation order, which for a tree inserted
// depth-first by `insertTaskTree` is the order the user typed the nodes in.
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
  ORDER BY tree.id
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
 * How many descendants of `id`, at any depth, are not yet `Done` (REQ-5.3).
 * `> 0` means a status change to `Done` must be rejected with
 * `400 SUBTASKS_NOT_DONE`.
 *
 * Runs in one recursive CTE / one round trip regardless of depth, checking
 * all descendants rather than just direct children — a child can be `Done`
 * while its own child isn't.
 *
 * Returns a count rather than the offending rows since the caller only needs
 * yes/no, and the count doubles as the number quoted in the error message.
 */
export async function countBlockingDescendants(pool: Pool, id: number): Promise<number> {
  const { rows } = await pool.query<{ blocking: number }>(
    `
    WITH RECURSIVE descendants AS (
      SELECT id, status FROM tasks WHERE parent_task_id = $1
      UNION ALL
      SELECT t.id, t.status
      FROM tasks t
      JOIN descendants d ON t.parent_task_id = d.id
    )
    SELECT COUNT(*)::int AS blocking FROM descendants WHERE status <> 'Done'
  `,
    [id],
  );
  return rows[0]!.blocking;
}

/**
 * Sets a task's status (`PATCH /tasks/:id/status`, REQ-2.5). The caller is
 * responsible for having already run the recursive Done-rule check
 * (`countBlockingDescendants`) — this function performs the write only.
 */
export async function updateTaskStatus(pool: Pool, id: number, status: TaskStatus): Promise<void> {
  await pool.query('UPDATE tasks SET status = $2 WHERE id = $1', [id, status]);
}

/**
 * Inserts a whole task/subtask tree in one transaction on one pooled client
 * (REQ-5.7), returning the root's new id. Callers re-read the full tree via
 * `getTaskTreeRows` to reuse the same mapping and shape as every other
 * endpoint.
 *
 * The single client matters: `BEGIN`/`COMMIT` are connection-scoped, so
 * issuing them via `pool.query` (which hands out an arbitrary connection per
 * call) would not form a transaction at all — every statement below goes
 * through `client`, never `pool`.
 *
 * A failure part-way through the tree (a bad skill id, a lost connection, a
 * constraint violation on a grandchild) rolls the whole thing back, leaving
 * zero rows rather than a half-built tree.
 */
export async function insertTaskTree(pool: Pool, root: CreateTaskRequest): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rootId = await insertTaskNode(client, root, null);
    await client.query('COMMIT');
    return rootId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * One node of the tree, depth-first: insert the task row, write its
 * `task_skills` rows, then recurse into each child passing the new id down
 * as `parent_task_id` (REQ-1.10).
 *
 * The awaits are sequential rather than `Promise.all`: a single `pg` client
 * is one connection and cannot run queries concurrently.
 */
async function insertTaskNode(
  client: PoolClient,
  node: CreateTaskRequest,
  parentTaskId: number | null,
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    'INSERT INTO tasks (title, parent_task_id) VALUES ($1, $2) RETURNING id',
    [node.title, parentTaskId],
  );
  const taskId = rows[0]!.id;

  for (const skillId of node.skillIds) {
    await client.query('INSERT INTO task_skills (task_id, skill_id) VALUES ($1, $2)', [
      taskId,
      skillId,
    ]);
  }

  for (const child of node.subtasks) {
    await insertTaskNode(client, child, taskId);
  }

  return taskId;
}
