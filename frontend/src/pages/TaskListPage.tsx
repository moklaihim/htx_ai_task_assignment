import { useEffect, useState } from 'react';
import { fetchTasks } from '../api/tasks';
import { fetchDevelopers } from '../api/developers';
import { ApiError } from '../api/client';
import { TaskTable } from '../components/TaskTable';
import { replaceTaskInTree } from '../lib/taskTree';
import type { Developer, TaskNode } from '../types';

/** The Task List Page (REQ-3.1) — fetches every Task from `GET /tasks` and
 * every Developer from `GET /developers` (for the assignee dropdowns), and
 * renders them in a table matching the PDF wireframe. */
export function TaskListPage() {
  const [tasks, setTasks] = useState<TaskNode[] | null>(null);
  const [developers, setDevelopers] = useState<Developer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.all([fetchTasks(), fetchDevelopers()])
      .then(([taskResult, developerResult]) => {
        if (!cancelled) {
          setTasks(taskResult);
          setDevelopers(developerResult);
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

  function handleTaskUpdated(updated: TaskNode) {
    setTasks((current) => (current ? replaceTaskInTree(current, updated) : current));
  }

  return (
    <main className="page">
      <h1 className="page__title">Task List</h1>
      {error && (
        <p role="alert" className="alert-error">
          {error}
        </p>
      )}
      {!error && !tasks && <p className="empty-state">Loading…</p>}
      {tasks && tasks.length === 0 && <p className="empty-state">No tasks yet.</p>}
      {tasks && tasks.length > 0 && developers && (
        <TaskTable tasks={tasks} developers={developers} onTaskUpdated={handleTaskUpdated} />
      )}
    </main>
  );
}
