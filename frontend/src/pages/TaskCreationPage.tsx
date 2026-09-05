import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSkills } from '../api/skills';
import { createTask } from '../api/tasks';
import { ApiError } from '../api/client';
import { toast } from '../components/Toaster';
import { TaskFormNode } from '../components/TaskFormNode';
import { collectSkillInferenceFailures } from '../lib/taskTree';
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
      const created = await createTask(toCreateTaskInput(tree));
      const saved = countNodes(tree);
      toast.success(saved === 1 ? `Created "${tree.title.trim()}"` : `Created ${saved} tasks`);

      // REQ-4.6 — automatic skill detection failed for these nodes. Purely
      // informational: the tasks are already saved with an empty Skills list
      // (REQ-6.4), so this neither blocks nor rolls back the save, and the
      // navigation below happens either way. A toast rather than a dialog for
      // exactly that reason — there is no decision for the user to make, only
      // something to know, and the Skills can be set afterwards.
      const failedTitles = collectSkillInferenceFailures(created);
      if (failedTitles.length > 0) {
        toast.error(
          `Automatic skill detection failed for ${describeTitles(failedTitles)}. Saved with no Skills — you can add them later.`,
        );
      }

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

/**
 * Names the affected tasks in the REQ-4.6 notification, quoted so a title
 * reads as a title. A long tree could flag many nodes, so the list is capped —
 * a toast that grows to fill the screen stops being non-modal in practice.
 */
function describeTitles(titles: string[]): string {
  const shown = titles.slice(0, 3).map((title) => `"${title}"`);
  const remaining = titles.length - shown.length;

  return remaining > 0
    ? `${shown.join(', ')} and ${remaining} more`
    : shown.length > 1
      ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
      : shown[0]!;
}
