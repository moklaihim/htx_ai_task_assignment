import type { CreateTaskRequest } from '../schemas/task.js';

/**
 * Every distinct skill id appearing anywhere in a create-task tree, at any
 * depth. `POST /tasks` checks the whole set in one round trip before opening
 * the transaction (design §4.5) — validating only the root's ids would let a
 * bad id on a grandchild through, where it would surface as a foreign-key
 * violation mid-insert and a `500` instead of a `400 VALIDATION_ERROR`.
 *
 * De-duplicated because the same skill will commonly be required by several
 * nodes of one tree, and the id set is only used for an existence check.
 */
export function collectSkillIds(root: CreateTaskRequest): number[] {
  const ids = new Set<number>();

  const walk = (node: CreateTaskRequest): void => {
    for (const id of node.skillIds) ids.add(id);
    for (const child of node.subtasks) walk(child);
  };
  walk(root);

  return [...ids];
}
