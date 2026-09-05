import type { Developer, TaskNode } from '../types';
import { SkillTags } from './SkillTags';
import { AssigneeControl } from './AssigneeControl';

interface Props {
  task: TaskNode;
  developers: Developer[];
  onTaskUpdated: (updated: TaskNode) => void;
  depth?: number;
}

/**
 * One row per Task (REQ-3.1). Recursive — subtasks render as further rows
 * indented under their parent (design §6.2), though nothing has subtasks yet
 * in this phase (phase 4 is flat tasks only; nesting lands in phase 5).
 */
export function TaskRow({ task, developers, onTaskUpdated, depth = 0 }: Props) {
  return (
    <>
      <tr data-testid="task-row">
        <td style={{ paddingLeft: `${depth * 1.5}rem` }} data-testid="task-title">
          {task.title}
        </td>
        <td data-testid="task-skills">
          <SkillTags skills={task.skills} />
        </td>
        <td data-testid="task-status">{task.status}</td>
        <td data-testid="task-assignee">
          <AssigneeControl task={task} developers={developers} onTaskUpdated={onTaskUpdated} />
        </td>
      </tr>
      {task.subtasks.map((subtask) => (
        <TaskRow
          key={subtask.id}
          task={subtask}
          developers={developers}
          onTaskUpdated={onTaskUpdated}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
