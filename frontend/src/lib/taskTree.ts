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

/**
 * Titles of every node in a `POST /tasks` response that the backend marked
 * `skillInferenceFailed` (REQ-6.6, design §4.1), in tree order.
 *
 * The whole tree is walked, not just the root: inference runs per node from
 * that node's own title, so a saved tree can have any subset of its nodes
 * flagged — the root may classify fine while a subtask three levels down
 * does not. The titles are what the REQ-4.6 notification names, which is the
 * only way the user knows *which* of the tasks they just saved came out with
 * no skills.
 */
export function collectSkillInferenceFailures(task: TaskNode): string[] {
  const titles = task.skillInferenceFailed ? [task.title] : [];
  return titles.concat(...task.subtasks.map(collectSkillInferenceFailures));
}
