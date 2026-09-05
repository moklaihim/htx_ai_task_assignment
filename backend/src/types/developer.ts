import type { AssignedTaskSummary, Skill } from './task.js';

/**
 * Response shape for `GET /developers` and `GET /developers/:id` (design §4.1,
 * REQ-2.6, REQ-2.7). `skills` mirrors the shared `Skill` shape used on tasks so
 * `developerCanBeAssigned` (design §4.2) can operate on the same `{id, name}[]`
 * on both sides.
 */
export interface Developer {
  id: number;
  name: string;
  skills: Skill[];
  assignedTasks: AssignedTaskSummary[];
}
