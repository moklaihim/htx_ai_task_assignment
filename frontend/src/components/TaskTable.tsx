import type { TaskNode } from '../types';
import { TaskRow } from './TaskRow';

/** The Task List Page's table (REQ-3.1), one row per top-level Task. */
export function TaskTable({ tasks }: { tasks: TaskNode[] }) {
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
          <TaskRow key={task.id} task={task} />
        ))}
      </tbody>
    </table>
  );
}
