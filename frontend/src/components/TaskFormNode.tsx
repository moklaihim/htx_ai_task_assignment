import type { Skill } from '../types';
import { SkillMultiSelect } from './SkillMultiSelect';
import { replaceChild, type DraftNode } from '../lib/draftTree';

interface Props {
  node: DraftNode;
  skills: Skill[];
  onChange: (updated: DraftNode) => void;
  onAddSubtask: (localId: string) => void;
  depth?: number;
}

/**
 * One form node — the top-level Task and every nested subtask, at every
 * depth, rendered by this single component definition invoked recursively
 * (REQ-5.6, design §6.3). There is deliberately no `TaskFormLevel2`: adding a
 * fourth or tenth level needs no new code, only more recursion.
 *
 * `depth` drives indentation only — it changes no behavior and has no maximum
 * (REQ-5.4). The indent itself is one step per nested level, applied by the
 * stylesheet to `[data-depth]`; because the nodes are nested in the DOM the
 * steps already accumulate, and the page scrolls a deep tree horizontally
 * inside its panel rather than letting it run off the page.
 *
 * Edits travel back up one level at a time: a child hands its updated self to
 * this node, which folds it in with `replaceChild` and hands *itself* up. By
 * the time the page's `setState` runs it has received a whole new root, so
 * the tree stays immutable and React re-renders correctly.
 *
 * `onAddSubtask` is passed straight through rather than wrapped, because it
 * addresses a node by `localId` against the whole tree (`addSubtaskTo`) — the
 * button on a grandchild must add to that grandchild, not to whichever node
 * happens to be handling the callback (REQ-5.5).
 */
export function TaskFormNode({ node, skills, onChange, onAddSubtask, depth = 0 }: Props) {
  const label = depth === 0 ? 'Task' : 'Subtask';

  return (
    <div
      className="task-form-node"
      data-testid="task-form-node"
      data-depth={depth}
      data-local-id={node.localId}
    >
      <label>
        <span className="field-label">
          {label}
          {/* The title is the one field the form cannot save without, so it
            * carries the conventional asterisk. `aria-hidden` because the
            * input's own `required` already announces it to screen readers —
            * without it the field reads as "Subtask star, required". */}
          <span className="field-label__required" aria-hidden="true">
            *
          </span>
        </span>
        <input
          className="text-input"
          value={node.title}
          onChange={(e) => onChange({ ...node, title: e.target.value })}
          placeholder={depth === 0 ? 'Task title' : 'Subtask title'}
          data-testid="task-form-title"
          required
        />
      </label>

      <SkillMultiSelect
        skills={skills}
        selected={node.skillIds}
        onChange={(skillIds) => onChange({ ...node, skillIds })}
      />

      <button
        className="btn btn--secondary btn--sm"
        type="button"
        onClick={() => onAddSubtask(node.localId)}
        data-testid="add-subtask"
      >
        Add Subtask
      </button>

      {node.subtasks.map((child) => (
        <TaskFormNode
          key={child.localId}
          node={child}
          skills={skills}
          depth={depth + 1}
          onChange={(updated) => onChange(replaceChild(node, updated))}
          onAddSubtask={onAddSubtask}
        />
      ))}
    </div>
  );
}
