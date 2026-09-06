import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSkills } from '../api/skills';
import { createTask } from '../api/tasks';
import { ApiError } from '../api/client';
import { toast } from '../components/Toaster';
import { TaskFormNode } from '../components/TaskFormNode';
import { collectInferenceNotices, type ClassifiedTask } from '../lib/taskTree';
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
 * The Task Creation Page. No assignee field — assignment happens later, from
 * the Task List Page. On success, navigate back to the list.
 *
 * The whole draft tree lives in **one** `useState` object shaped like the
 * `POST /tasks` body, so submitting is a single serialization of a single
 * value — one `POST` for the entire tree, however deep, rather than one
 * request per node.
 *
 * Both callbacks rebuild from the root: `onChange` receives an already-folded
 * new root from `TaskFormNode`, and `onAddSubtask` runs `addSubtaskTo` over
 * the tree to reach the node whose button was clicked, at whatever depth.
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
      // `toCreateTaskInput` only strips `localId` — the draft shape already
      // matches the API's body shape.
      const created = await createTask(toCreateTaskInput(tree));
      const saved = countNodes(tree);
      toast.success(saved === 1 ? `Created "${tree.title.trim()}"` : `Created ${saved} tasks`);

      // All three notices are purely informational: the tasks are already
      // saved, so none blocks or rolls back the save. One toast per
      // *outcome*, not per task — colour carries the distinction: green
      // worked, slate is neutral information, red is broken.
      const notices = collectInferenceNotices(created);

      // The LLM chose these Skills — worth saying out loud, since the user
      // submitted the form with the Skills list empty.
      if (notices.classified.length > 0) {
        toast.success(describeClassified(notices.classified));
      }

      // The LLM call itself went wrong for these nodes. The only remedy is
      // to create the Task again — Skills can't be added after the fact.
      if (notices.failed.length > 0) {
        toast.error(
          `Automatic skill detection failed for ${describeTitles(notices.failed)}. Saved with no Skills.`,
        );
      }

      // The LLM worked and reported that these titles are not software
      // tasks it can classify. An `info` toast, not an error: nothing failed.
      if (notices.unclassifiable.length > 0) {
        toast.info(
          `No Skills detected for ${describeTitles(notices.unclassifiable)} — the title doesn't describe a software task. Saved with no Skills.`,
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
    <main className="page">
      <h1 className="page__title">Create Task(s)</h1>
      <form onSubmit={handleSubmit} className="panel panel--padded">
        {/* A deep tree indents further than any viewport is wide, so the
          * nodes scroll horizontally inside the panel. */}
        <div className="task-form-scroll">
          {skills && (
            <TaskFormNode
              node={tree}
              skills={skills}
              onChange={setTree}
              onAddSubtask={(localId) => setTree((current) => addSubtaskTo(current, localId))}
            />
          )}
        </div>

        <div className="form-actions">
          <button
            className="btn btn--primary"
            type="submit"
            disabled={saving || !everyTitleFilled(tree)}
            data-testid="save-task"
          >
            {saving ? 'Saving…' : total === 1 ? 'Save' : `Save ${total} tasks`}
          </button>
        </div>
      </form>
    </main>
  );
}

/**
 * A single task names its Skills (`Frontend and Backend for "Build the login
 * form"`); several tasks name only the titles, since one line per task is
 * what turns a toast into a wall of text. `describeTitles` handles the
 * capping either way.
 */
function describeClassified(classified: ClassifiedTask[]): string {
  const titles = classified.map((task) => task.title);
  const [only] = classified;

  return classified.length === 1
    ? `Skills detected — ${joinWords(only!.skills)} for ${describeTitles(titles)}.`
    : `Skills detected for ${describeTitles(titles)}.`;
}

/** `["Frontend","Backend"]` → `Frontend and Backend`. */
function joinWords(words: string[]): string {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0] ?? '';
}

/**
 * Names the affected tasks in a notification, quoted so a title reads as a
 * title. A long tree could flag many nodes, so the list is capped — a toast
 * that grows to fill the screen stops being non-modal in practice.
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
