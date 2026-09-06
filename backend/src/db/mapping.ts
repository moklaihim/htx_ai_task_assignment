import type { AssignedTaskSummary, Skill, TaskRow, TaskStatus } from '../types/task.js';
import type { Developer } from '../types/developer.js';

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
 * contract use (design §4.4). With no ORM, every query result passes through
 * here so column naming stays confined to the db/ layer.
 *
 * `assignee_id`/`assignee_name` become a nested `assignee` object, or `null`
 * when the task is unassigned. `skills` defaults to `[]`.
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

/**
 * A developer row as returned by the query in `db/developers.ts` — one row
 * per developer, with `skills` and `assigned_tasks` each aggregated into a
 * JSON array by a correlated subquery rather than a join, since a developer
 * has two independent one-to-many relations that a single join would
 * cross-multiply.
 */
export interface DbDeveloperRow {
  id: number;
  name: string;
  skills: Skill[] | null;
  assigned_tasks: AssignedTaskSummary[] | null;
}

/** Maps a developer row to the camelCase shape the API contract uses (REQ-2.6, REQ-2.7). */
export function toDeveloper(row: DbDeveloperRow): Developer {
  return {
    id: row.id,
    name: row.name,
    skills: row.skills ?? [],
    assignedTasks: row.assigned_tasks ?? [],
  };
}

