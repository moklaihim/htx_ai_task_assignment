import type { Developer, TaskNode } from '../types';
import { SkillTags } from './SkillTags';
import { AssigneeControl } from './AssigneeControl';
import { StatusControl } from './StatusControl';

interface Props {
  task: TaskNode;
  developers: Developer[];
  onTaskUpdated: (updated: TaskNode) => void;
  /** Outline number, e.g. `1`, `1.1`, `1.1.1` — matches the PDF wireframe. */
  outline: string;
  depth?: number;
}

/**
 * One row per Task (REQ-3.1). Recursive — each subtask renders as a further
 * row nested under its parent, indented by depth, from this one component
 * definition at every level (design §6.2).
 *
 * Indentation alone is a weak cue in a flat `<table>`, where every row is a
 * sibling in the DOM whatever it is in the data. The outline number (`1.1.1`)
 * states the nesting explicitly, and `aria-level` gives assistive technology
 * the depth that the visual indent conveys to everyone else.
 */
export function TaskRow({ task, developers, onTaskUpdated, outline, depth = 0 }: Props) {
  return (
    <>
      <tr data-testid="task-row" data-depth={depth} aria-level={depth + 1}>
        <td style={{ paddingLeft: `${depth * 1.5}rem` }} data-testid="task-title">
          <span style={{ color: '#777', marginRight: '0.5rem' }} data-testid="task-outline">
            {outline}
          </span>
          {task.title}
        </td>
        <td data-testid="task-skills">
          <SkillTags skills={task.skills} />
        </td>
        <td data-testid="task-status">
          <StatusControl task={task} onTaskUpdated={onTaskUpdated} />
        </td>
        <td data-testid="task-assignee">
          <AssigneeControl task={task} developers={developers} onTaskUpdated={onTaskUpdated} />
        </td>
      </tr>
      {task.subtasks.map((subtask, index) => (
        <TaskRow
          key={subtask.id}
          task={subtask}
          developers={developers}
          onTaskUpdated={onTaskUpdated}
          outline={`${outline}.${index + 1}`}
          depth={depth + 1}
        />
      ))}
    </>
  );
}
