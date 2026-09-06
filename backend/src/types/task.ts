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
   * `POST /tasks` response only. `true` if the LLM was invoked for this node
   * (empty `skillIds`) and failed — network error, timeout, unusable response
   * — so `skills` is `[]`. Absent elsewhere, including `GET`.
   */
  skillInferenceFailed?: boolean;
  /**
   * `POST /tasks` response only. Present iff `skillInferenceFailed` is `true`
   * — the same message logged server-side (design §5.3), shown to the user so
   * they know *why* Skills are empty rather than just that they are.
   */
  skillInferenceFailureReason?: string;
  /**
   * `POST /tasks` response only (REQ-6.8). `true` if the LLM answered that the
   * title isn't a software task it can classify (`"buy eggs"`, `"123145"`).
   * `skills` is `[]`, but nothing failed — reported to the frontend as
   * information, not an error (REQ-4.7). Mutually exclusive with
   * `skillInferenceFailed`.
   */
  skillInferenceUnclassifiable?: boolean;
  /**
   * `POST /tasks` response only (REQ-6.9). `true` if `skills` on this node
   * came from the LLM rather than the user — otherwise indistinguishable,
   * since a populated `skills` array looks the same either way (REQ-4.8).
   * Mutually exclusive with the other two markers.
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
