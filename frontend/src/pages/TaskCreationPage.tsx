import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSkills } from '../api/skills';
import { createTask } from '../api/tasks';
import { ApiError } from '../api/client';
import { toast } from '../components/Toaster';
import { TaskFormNode } from '../components/TaskFormNode';
import {
  addSubtaskTo,
  countNodes,
  emptyNode,
  everyTitleFilled,
  toCreateTaskInput,
  type DraftNode,
} from '../lib/draftTree';
import type { Skill } from '../types';

/**
 * The Task Creation Page (REQ-4.1, extended by REQ-5.4–5.7). No assignee
 * field (REQ-4.4 — assignment happens later, from the Task List Page). On
 * success, navigate back to the list (REQ-4.5).
 *
 * The whole draft tree lives in **one** `useState` object shaped like the
 * `POST /tasks` body (design §6.3), so submitting is a single serialization
 * of a single value — one `POST` for the entire tree, however deep, rather
 * than one request per node (REQ-5.7).
 *
 * Both callbacks rebuild from the root: `onChange` receives an already-folded
 * new root from `TaskFormNode`, and `onAddSubtask` runs `addSubtaskTo` over
 * the tree to reach the node whose button was clicked, at whatever depth
 * (REQ-5.5).
 */
export function TaskCreationPage() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [tree, setTree] = useState<DraftNode>(() => emptyNode());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchSkills()
      .then((result) => {
        if (!cancelled) {
          setSkills(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          toast.error(err instanceof ApiError ? err.message : 'Failed to load skills');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // One request, whole tree — `toCreateTaskInput` only strips `localId`,
      // because the draft shape already matches the API's body shape.
      await createTask(toCreateTaskInput(tree));
      const saved = countNodes(tree);
      toast.success(saved === 1 ? `Created "${tree.title.trim()}"` : `Created ${saved} tasks`);
      navigate('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create task');
    } finally {
      setSaving(false);
    }
  }

  const total = countNodes(tree);

  return (
    <main>
      <h1>Create Task(s)</h1>
      <form onSubmit={handleSubmit}>
        {skills && (
          <TaskFormNode
            node={tree}
            skills={skills}
            onChange={setTree}
            onAddSubtask={(localId) => setTree((current) => addSubtaskTo(current, localId))}
          />
        )}

        <button
          type="submit"
          disabled={saving || !everyTitleFilled(tree)}
          data-testid="save-task"
          style={{ marginTop: '1rem' }}
        >
          {saving ? 'Saving…' : total === 1 ? 'Save' : `Save ${total} tasks`}
        </button>
      </form>
    </main>
  );
}
