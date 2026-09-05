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
}
