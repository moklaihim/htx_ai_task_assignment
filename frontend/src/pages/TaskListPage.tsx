import { useEffect, useState } from 'react';
import { fetchTasks } from '../api/tasks';
import { ApiError } from '../api/client';
import { TaskTable } from '../components/TaskTable';
import type { TaskNode } from '../types';

/** The Task List Page (REQ-3.1) — fetches every Task from `GET /tasks` and
 * renders them in a table matching the PDF wireframe. */
export function TaskListPage() {
  const [tasks, setTasks] = useState<TaskNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchTasks()
      .then((result) => {
        if (!cancelled) {
          setTasks(result);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Failed to load tasks');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>Task List</h1>
      {error && <p role="alert">{error}</p>}
      {!error && !tasks && <p>Loading…</p>}
      {tasks && tasks.length === 0 && <p>No tasks yet.</p>}
      {tasks && tasks.length > 0 && <TaskTable tasks={tasks} />}
    </main>
  );
}
