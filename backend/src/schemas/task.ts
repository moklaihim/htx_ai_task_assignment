import { z } from 'zod';
import type { CreateTaskInput } from '../types/task.js';

/**
 * A validated `POST /tasks` node. Identical at every depth (REQ-5.2); both
 * optional fields resolve to `[]` by default, so insert code never has to
 * deal with `undefined`.
 */
export interface CreateTaskRequest {
  title: string;
  skillIds: number[];
  subtasks: CreateTaskRequest[];
}

/**
 * `POST /tasks` request body (REQ-2.1, REQ-5.1, REQ-5.2) — one recursive
 * shape describing a whole task/subtask tree in a single request (REQ-5.7).
 *
 * `z.lazy` makes the recursion possible: the schema refers to itself inside
 * `subtasks`, and a plain `z.object({...})` literal can't reference the const
 * it's being assigned to. `z.lazy` defers that reference to parse time. The
 * explicit `z.ZodType<…>` annotation is needed for the same reason on the
 * TypeScript side.
 *
 * One schema applied at every level means a malformed node is rejected at
 * *any* depth, not just the root.
 *
 * `skillIds` and `subtasks` both default to `[]`, so an omitted field and an
 * explicit empty array behave identically. An empty `skillIds` triggers LLM
 * inference later, not a validation failure now.
 */
export const createTaskSchema: z.ZodType<CreateTaskRequest, z.ZodTypeDef, CreateTaskInput> = z.lazy(
  () =>
    z.object({
      title: z.string().trim().min(1, 'title must not be empty'),
      skillIds: z.array(z.number().int('skillIds must contain integers')).optional().default([]),
      subtasks: z.array(createTaskSchema).optional().default([]),
    }),
);

/**
 * Turns a `ZodError` into one human-readable string, prefixing each issue
 * with its path (`subtasks.0.subtasks.1.title: …`) so a failure deep inside a
 * tree identifies which node was bad.
 */
export function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

/**
 * `PATCH /tasks/:id/assign` request body (REQ-2.4). `assigneeId` is nullable
 * so the same endpoint unassigns a task by passing `null`.
 */
export const assignTaskSchema = z.object({
  assigneeId: z.number().int('assigneeId must be an integer').nullable(),
});

export type AssignTaskRequest = z.infer<typeof assignTaskSchema>;

/**
 * `PATCH /tasks/:id/status` request body (REQ-2.5). `z.enum` rejects any
 * value outside the three statuses REQ-1.6 fixes, matching the database's own
 * `task_status` ENUM. The recursive Done rule (REQ-5.3) depends on other rows,
 * so the route applies it separately via `countBlockingDescendants`.
 */
export const updateTaskStatusSchema = z.object({
  status: z.enum(['To-do', 'In Progress', 'Done'], {
    message: 'status must be one of: To-do, In Progress, Done',
  }),
});

export type UpdateTaskStatusRequest = z.infer<typeof updateTaskStatusSchema>;
