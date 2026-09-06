import { useState } from 'react';
import type { TaskNode, TaskStatus } from '../types';
import { updateTaskStatus } from '../api/tasks';
import { ApiError } from '../api/client';
import { toast } from './Toaster';

interface Props {
  task: TaskNode;
  onTaskUpdated: (updated: TaskNode) => void;
}

const STATUSES: TaskStatus[] = ['To-do', 'In Progress', 'Done'];

/**
 * Modifier for the status dot, which colors the *saved* status — the
 * dropdown can hold an unsaved selection, the dot never does.
 */
const DOT_MODIFIER: Record<TaskStatus, string> = {
  'To-do': '',
  'In Progress': ' status-dot--in-progress',
  Done: ' status-dot--done',
};

/**
 * Dropdown + Update button pair, one per Task row. Same three-state pattern
 * as `AssigneeControl`. Unlike the assignee dropdown, all three statuses are
 * always listed — the recursive Done rule depends on subtask state the
 * server owns, so it's enforced server-side and surfaced as a rejection
 * rather than by hiding the option.
 */
export function StatusControl({ task, onTaskUpdated }: Props) {
  const [selected, setSelected] = useState<TaskStatus>(task.status);
  const [saving, setSaving] = useState(false);

  const dirty = selected !== task.status;

  async function submit() {
    setSaving(true);
    try {
      const updated = await updateTaskStatus(task.id, selected);
      onTaskUpdated(updated);
      toast.success(`${task.title}: status updated to ${updated.status}`);
    } catch (err) {
      // The UI never shows a value the server rejected — revert the dropdown
      // to the last saved value and surface the server's message.
      setSelected(task.status);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  return (
    <span className="control-pair">
      <span className={`status-dot${DOT_MODIFIER[task.status]}`} aria-hidden="true" />
      <select
        className="select"
        aria-label={`Status for ${task.title}`}
        disabled={saving}
        value={selected}
        onChange={(e) => setSelected(e.target.value as TaskStatus)}
      >
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <button className="btn btn--secondary btn--sm" disabled={!dirty || saving} onClick={submit}>
        {saving ? 'Saving…' : 'Update'}
      </button>
    </span>
  );
}
