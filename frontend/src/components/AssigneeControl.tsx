import { useState } from 'react';
import type { Developer, TaskNode } from '../types';
import { assignTask } from '../api/tasks';
import { ApiError } from '../api/client';
import { toast } from './Toaster';
import { developerCanBeAssigned } from '../lib/developerCanBeAssigned';

interface Props {
  task: TaskNode;
  developers: Developer[];
  onTaskUpdated: (updated: TaskNode) => void;
}

const UNASSIGNED = '';

/**
 * Dropdown + Update button pair, one per Task row (REQ-3.2). Follows the
 * three-state Update-button pattern (design §6.4):
 *
 * | dropdown value vs. saved | dropdown | button |
 * |---|---|---|
 * | matches saved   | enabled  | disabled |
 * | changed, unsaved | enabled  | enabled |
 * | request in flight | disabled | disabled, "Saving…" |
 *
 * The dropdown only lists developers who possess every Skill the Task
 * requires (REQ-3.3), using the same superset rule the server enforces
 * (design §4.2) — the server still re-checks regardless.
 */
export function AssigneeControl({ task, developers, onTaskUpdated }: Props) {
  const [selected, setSelected] = useState<number | null>(task.assignee?.id ?? null);
  const [saving, setSaving] = useState(false);

  const savedId = task.assignee?.id ?? null;
  const dirty = selected !== savedId;

  const taskSkillIds = task.skills.map((skill) => skill.id);
  const eligible = developers.filter((dev) =>
    developerCanBeAssigned(
      dev.skills.map((skill) => skill.id),
      taskSkillIds,
    ),
  );

  async function submit() {
    setSaving(true);
    try {
      const updated = await assignTask(task.id, selected);
      onTaskUpdated(updated);
      const name = updated.assignee?.name ?? 'Unassigned';
      toast.success(`${task.title}: assignee updated to ${name}`);
    } catch (err) {
      // REQ-3.4: the UI never shows a value the server rejected — revert the
      // dropdown to the last saved value and surface the server's message.
      setSelected(savedId);
      toast.error(err instanceof ApiError ? err.message : 'Failed to update assignee');
    } finally {
      setSaving(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
      <select
        aria-label={`Assignee for ${task.title}`}
        disabled={saving}
        value={selected === null ? UNASSIGNED : String(selected)}
        onChange={(e) => setSelected(e.target.value === UNASSIGNED ? null : Number(e.target.value))}
      >
        <option value={UNASSIGNED}>Unassigned</option>
        {eligible.map((dev) => (
          <option key={dev.id} value={dev.id}>
            {dev.name}
          </option>
        ))}
      </select>
      <button disabled={!dirty || saving} onClick={submit}>
        {saving ? 'Saving…' : 'Update'}
      </button>
    </span>
  );
}
