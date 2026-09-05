import type { Developer, TaskNode } from '../types';
import { TaskRow } from './TaskRow';

interface Props {
  tasks: TaskNode[];
  developers: Developer[];
  onTaskUpdated: (updated: TaskNode) => void;
}

/** The Task List Page's table (REQ-3.1), one row per top-level Task. */
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
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} developers={developers} onTaskUpdated={onTaskUpdated} />
        ))}
      </tbody>
    </table>
  );
}
