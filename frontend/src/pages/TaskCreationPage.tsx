import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSkills } from '../api/skills';
import { createTask } from '../api/tasks';
import { ApiError } from '../api/client';
import { toast } from '../components/Toaster';
import { SkillMultiSelect } from '../components/SkillMultiSelect';
import type { Skill } from '../types';

/**
 * The Task Creation Page (REQ-4.1). Title + skill multi-select, no assignee
 * field (REQ-4.4 — assignment happens later, from the Task List Page). On
 * submit, `POST /tasks` and navigate back to the list on success (REQ-4.5).
 */
export function TaskCreationPage() {
  const navigate = useNavigate();
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [title, setTitle] = useState('');
  const [skillIds, setSkillIds] = useState<number[]>([]);
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
      await createTask({ title, skillIds });
      toast.success(`Created "${title}"`);
      navigate('/');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to create task');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main>
      <h1>New Task</h1>
      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: '1rem' }}>
          Title
          <br />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            required
          />
        </label>

        {skills && <SkillMultiSelect skills={skills} selected={skillIds} onChange={setSkillIds} />}

        <button type="submit" disabled={saving || title.trim().length === 0} style={{ marginTop: '1rem' }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>
    </main>
  );
}
