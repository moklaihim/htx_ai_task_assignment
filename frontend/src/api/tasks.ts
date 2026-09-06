import { getJson, patchJson, postJson } from './client';
import type { CreateTaskInput, TaskNode, TaskStatus } from '../types';

// Typed wrappers around the `/tasks` endpoints. Return/parameter types come
// straight from `../types`, so a change to the shared shapes breaks
// compilation here rather than failing silently at runtime.

/** `GET /tasks` — every top-level task, subtasks nested inside. */
export function fetchTasks(): Promise<TaskNode[]> {
  return getJson<TaskNode[]>('/tasks');
}

/** `GET /tasks/:id` — one task and its full subtask tree. */
export function fetchTask(id: number): Promise<TaskNode> {
  return getJson<TaskNode>(`/tasks/${id}`);
}

/** `POST /tasks`. */
export function createTask(input: CreateTaskInput): Promise<TaskNode> {
  return postJson<TaskNode>('/tasks', input);
}

/** `PATCH /tasks/:id/assign`. `assigneeId: null` unassigns. */
export function assignTask(id: number, assigneeId: number | null): Promise<TaskNode> {
  return patchJson<TaskNode>(`/tasks/${id}/assign`, { assigneeId });
}

/** `PATCH /tasks/:id/status`. */
export function updateTaskStatus(id: number, status: TaskStatus): Promise<TaskNode> {
  return patchJson<TaskNode>(`/tasks/${id}/status`, { status });
}
