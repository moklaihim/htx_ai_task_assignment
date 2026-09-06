// Mirrors backend/src/types/task.ts exactly (design §6.5, REQ-0.1: frontend
// and backend are independently deployable services, each with its own
// Docker build context, so the shapes are duplicated rather than imported
// across the boundary). Keep this file in sync by hand if the backend shape
// changes — an out-of-sync copy shows up as a compile error here, which is
// the whole point of sharing typed shapes (task 4.2 acceptance).
export type TaskStatus = 'To-do' | 'In Progress' | 'Done';

export interface Skill {
  id: number;
  name: string;
}

export interface Assignee {
  id: number;
  name: string;
}

/** One task as the rest of the code sees it — camelCase, assignee folded into an object. */
export interface TaskRow {
  id: number;
  title: string;
  status: TaskStatus;
  parentTaskId: number | null;
  assignee: Assignee | null;
  skills: Skill[];
}

/** A TaskRow once its children have been linked in (design §4.4). */
export interface TaskNode extends TaskRow {
  subtasks: TaskNode[];
  /**
   * Present only in the `POST /tasks` response (design §4.1). `true` means the
   * LLM was invoked for this node (its `skillIds` was empty) and the attempt
   * **failed** — network error, timeout, unusable response — so `skills` is
   * `[]` because something went wrong. Absent everywhere else, including `GET`.
   */
  skillInferenceFailed?: boolean;
  /**
   * Present only in the `POST /tasks` response (design §4.1, REQ-6.8). `true`
   * means the LLM was invoked and answered successfully that the title is not
   * a software task it can classify (`"buy eggs"`, `"123145"`). `skills` is
   * `[]` because there was nothing to infer — **not** because anything failed,
   * which is why this is a separate flag from `skillInferenceFailed` and why
   * the frontend reports it as information rather than as an error (REQ-4.7).
   * Mutually exclusive with `skillInferenceFailed`.
   */
  skillInferenceUnclassifiable?: boolean;
  /**
   * Present only in the `POST /tasks` response (design §4.1, REQ-6.9). `true`
   * means the `skills` on this node came from the **LLM**, not from the user.
   * Without it the two are indistinguishable — a populated `skills` array looks
   * identical either way — so the frontend could not confirm what inference
   * actually did (REQ-4.8). Mutually exclusive with the other two markers.
   */
  skillInferenceApplied?: boolean;
}

/**
 * Recursive request body for `POST /tasks` (design §4.1, REQ-2.1, REQ-5.7).
 * `skillIds` and `subtasks` are both optional and default to `[]`.
 */
export interface CreateTaskInput {
  title: string;
  skillIds?: number[];
  subtasks?: CreateTaskInput[];
}

/** The minimal shape of a task as it appears inside `Developer.assignedTasks` (REQ-2.6). */
export interface AssignedTaskSummary {
  id: number;
  title: string;
  status: TaskStatus;
}
