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
 * What the `POST /tasks` response says the LLM did, split by outcome
 * (design §4.1). Every node the backend marked appears in exactly one list.
 *
 * `classified` — `skillInferenceApplied` (REQ-6.9): the LLM chose these Skills,
 * and the user is shown which (REQ-4.8). Carried with its skill names, because
 * "we picked something for you" is only useful alongside *what* was picked.
 *
 * `failed` — `skillInferenceFailed` (REQ-6.6): the LLM call itself went wrong,
 * and the user is told so (REQ-4.6).
 *
 * `unclassifiable` — `skillInferenceUnclassifiable` (REQ-6.8): the LLM
 * answered, correctly, that the title is not a software task. Nothing went
 * wrong, so this is reported as information, never as an error (REQ-4.7) —
 * reporting it as one is exactly the bug this split fixes, since both empty
 * cases otherwise look identical from here: an empty `skills` array.
 *
 * The whole tree is walked, not just the root: inference runs per node from
 * that node's own title, so a saved tree can have any mix of outcomes — the
 * root may classify fine while a subtask three levels down does not. The titles
 * are what the notifications name, which is the only way the user knows *which*
 * of the tasks they just saved got which outcome.
 */
export interface ClassifiedTask {
  title: string;
  skills: string[];
}

export interface InferenceNotices {
  classified: ClassifiedTask[];
  failed: string[];
  unclassifiable: string[];
}

export function collectInferenceNotices(task: TaskNode): InferenceNotices {
  const notices: InferenceNotices = { classified: [], failed: [], unclassifiable: [] };

  const visit = (node: TaskNode) => {
    if (node.skillInferenceApplied) {
      notices.classified.push({
        title: node.title,
        skills: node.skills.map((skill) => skill.name),
      });
    } else if (node.skillInferenceFailed) {
      notices.failed.push(node.title);
    } else if (node.skillInferenceUnclassifiable) {
      notices.unclassifiable.push(node.title);
    }
    node.subtasks.forEach(visit);
  };

  visit(task);
  return notices;
}
