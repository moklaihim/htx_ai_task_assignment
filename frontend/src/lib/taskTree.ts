import type { TaskNode } from '../types';

/**
 * Replaces one node in a Task tree by id, keeping the rest of the tree
 * intact. Used to fold a `PATCH` response back into the Task List Page's
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
 * What the `POST /tasks` response says the LLM did, split by outcome. Every
 * node the backend marked appears in exactly one list.
 *
 * `classified` — the LLM chose these Skills, carried with their names so the
 * user is shown what was picked.
 *
 * `failed` — the LLM call itself went wrong.
 *
 * `unclassifiable` — the LLM answered, correctly, that the title is not a
 * software task. Nothing went wrong, so this is reported as information,
 * never as an error — both empty cases otherwise look identical from here:
 * an empty `skills` array.
 *
 * The whole tree is walked, not just the root: inference runs per node from
 * that node's own title, so a saved tree can have any mix of outcomes.
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
