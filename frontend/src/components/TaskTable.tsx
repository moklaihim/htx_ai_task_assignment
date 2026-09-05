import type { Developer, TaskNode } from '../types';
import { TaskRow } from './TaskRow';

interface Props {
  tasks: TaskNode[];
  developers: Developer[];
  onTaskUpdated: (updated: TaskNode) => void;
}

/**
 * The Task List Page's table (REQ-3.1), one row per top-level Task — each of
 * which expands into further rows for its own subtasks, to any depth, via
 * `TaskRow`'s recursion. `GET /tasks` returns roots only with subtasks nested
 * inside (design §4.1), so mapping over `tasks` here lists each task exactly
 * once.
 */
export function TaskTable({ tasks, developers, onTaskUpdated }: Props) {
  return (
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Skills</th>
          <th>Status</th>
          <th>Assignee</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map((task, index) => (
          <TaskRow
            key={task.id}
            task={task}
            developers={developers}
            onTaskUpdated={onTaskUpdated}
            outline={String(index + 1)}
          />
        ))}
      </tbody>
    </table>
  );
}
