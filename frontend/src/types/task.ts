// Mirrors backend/src/types/task.ts exactly. Frontend and backend are
// independently deployable services, each with its own Docker build context,
// so the shapes are duplicated rather than imported across the boundary.
// Keep this file in sync by hand if the backend shape changes — an
// out-of-sync copy shows up as a compile error here.
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

/** A TaskRow once its children have been linked in. */
export interface TaskNode extends TaskRow {
  subtasks: TaskNode[];
  /**
   * Present only in the `POST /tasks` response. `true` means the LLM was
   * invoked for this node (its `skillIds` was empty) and the attempt
   * **failed** — network error, timeout, unusable response — so `skills` is
   * `[]` because something went wrong. Absent everywhere else, including `GET`.
   */
  skillInferenceFailed?: boolean;
  /**
   * Present only in the `POST /tasks` response. `true` means the LLM was
   * invoked and answered successfully that the title is not a software task
   * it can classify (`"buy eggs"`, `"123145"`). `skills` is `[]` because
   * there was nothing to infer — **not** because anything failed, which is
   * why the frontend reports it as information rather than as an error.
   * Mutually exclusive with `skillInferenceFailed`.
   */
  skillInferenceUnclassifiable?: boolean;
  /**
   * Present only in the `POST /tasks` response. `true` means the `skills` on
   * this node came from the **LLM**, not from the user — without it the two
   * are indistinguishable, since a populated `skills` array looks identical
   * either way. Mutually exclusive with the other two markers.
   */
  skillInferenceApplied?: boolean;
}

/**
 * Recursive request body for `POST /tasks`. `skillIds` and `subtasks` are
 * both optional and default to `[]`.
 */
export interface CreateTaskInput {
  title: string;
  skillIds?: number[];
  subtasks?: CreateTaskInput[];
}

/** The minimal shape of a task as it appears inside `Developer.assignedTasks`. */
export interface AssignedTaskSummary {
  id: number;
  title: string;
  status: TaskStatus;
}
