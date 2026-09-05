import { getJson, patchJson, postJson } from './client';
import type { CreateTaskInput, TaskNode, TaskStatus } from '../types';

// Typed wrappers around the `/tasks` endpoints (design §4.1, §6.5). Each
// function's return/parameter types come straight from `../types`, so a
// change to the shared shapes breaks compilation here rather than failing
// silently at runtime (task 4.2 acceptance).

/** `GET /tasks` — every top-level task, subtasks nested inside (REQ-2.2). */
export function fetchTasks(): Promise<TaskNode[]> {
  return getJson<TaskNode[]>('/tasks');
}

/** `GET /tasks/:id` — one task and its full subtask tree (REQ-2.3). */
export function fetchTask(id: number): Promise<TaskNode> {
  return getJson<TaskNode>(`/tasks/${id}`);
}

/** `POST /tasks` (REQ-2.1). */
export function createTask(input: CreateTaskInput): Promise<TaskNode> {
  return postJson<TaskNode>('/tasks', input);
}

/** `PATCH /tasks/:id/assign` (REQ-2.4). `assigneeId: null` unassigns. */
export function assignTask(id: number, assigneeId: number | null): Promise<TaskNode> {
  return patchJson<TaskNode>(`/tasks/${id}/assign`, { assigneeId });
}

/** `PATCH /tasks/:id/status` (REQ-2.5). */
export function updateTaskStatus(id: number, status: TaskStatus): Promise<TaskNode> {
  return patchJson<TaskNode>(`/tasks/${id}/status`, { status });
}
