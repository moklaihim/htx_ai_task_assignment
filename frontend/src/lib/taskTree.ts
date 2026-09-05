import type { TaskNode } from '../types';

/**
 * Replaces one node in a Task tree by id, keeping the rest of the tree intact
 * (design §6.2 — `TaskRow` is recursive, so a Task can be nested arbitrarily
 * deep). Used to fold a `PATCH` response back into the Task List Page's
 * state without refetching the whole list.
 */
export function replaceTaskInTree(tasks: TaskNode[], updated: TaskNode): TaskNode[] {
  return tasks.map((task) => {
    if (task.id === updated.id) {
      return updated;
    }
    if (task.subtasks.length === 0) {
      return task;
    }
    return { ...task, subtasks: replaceTaskInTree(task.subtasks, updated) };
  });
}
