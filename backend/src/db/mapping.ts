import type { Skill, TaskRow, TaskStatus } from '../types/task.js';

/**
 * A task row exactly as `pg` returns it from the query in design §4.4 — column
 * names untouched, and the assignee spread across two flat columns by the
 * LEFT JOIN on developers.
 */
export interface DbTaskRow {
  id: number;
  title: string;
  status: TaskStatus;
  parent_task_id: number | null;
  assignee_id: number | null;
  assignee_name: string | null;
  skills: Skill[] | null;
}

/**
 * Maps a database row to the camelCase shape the services, routes and API
 * contract use (design §4.4). With no ORM nothing does this automatically, so
 * every query result passes through here and column naming stays confined to the
 * db/ layer.
 *
 * `assignee_id`/`assignee_name` become a nested `assignee` object, or `null` when
 * the task is unassigned. `skills` defaults to `[]` — the query's COALESCE
 * already does that, but a query written without it must not produce `null`
 * where the contract promises an array.
 */
export function toTaskRow(row: DbTaskRow): TaskRow {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    parentTaskId: row.parent_task_id,
    assignee:
      row.assignee_id === null
        ? null
        : { id: row.assignee_id, name: row.assignee_name ?? '' },
    skills: row.skills ?? [],
  };
}
