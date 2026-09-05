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
   * LLM was invoked for this node (its `skillIds` was empty) and the call
   * failed, so `skills` is `[]` for a reason other than the user/LLM
   * legitimately choosing no skills. Absent everywhere else, including `GET`.
   */
  skillInferenceFailed?: boolean;
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
