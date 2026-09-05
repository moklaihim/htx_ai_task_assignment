import type { TaskNode, TaskRow } from '../types/task.js';

/**
 * Assembles flat, mapped task rows into a forest of nested `TaskNode`s
 * (design §4.4). Linear in the number of rows: one pass builds a lookup map
 * with every node's `subtasks` pre-created empty, a second links each node
 * into its parent's `subtasks` — or, if its parent isn't in this row set (or
 * is `null`), promotes it to a root.
 *
 * That "parent not in this row set" case is what makes `GET /tasks/:id` on a
 * subtask work without special-casing: the target's own parent lies outside
 * the fetched rows, `byId.get(parentTaskId)` returns `undefined`, and the
 * target becomes the (only) root of the returned tree.
 */
export function buildForest(rows: TaskRow[]): TaskNode[] {
  const byId = new Map<number, TaskNode>(rows.map((r) => [r.id, { ...r, subtasks: [] }]));
  const roots: TaskNode[] = [];

  for (const node of byId.values()) {
    const parent = node.parentTaskId === null ? null : byId.get(node.parentTaskId);
    if (parent) {
      parent.subtasks.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}
