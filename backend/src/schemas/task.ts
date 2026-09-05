import { z } from 'zod';
import type { CreateTaskInput } from '../types/task.js';

/**
 * A validated `POST /tasks` node. Identical at every depth (REQ-5.2), with
 * both optional fields resolved to `[]` by the schema's defaults, so the
 * insert code never has to deal with `undefined`.
 */
export interface CreateTaskRequest {
  title: string;
  skillIds: number[];
  subtasks: CreateTaskRequest[];
}

/**
 * `POST /tasks` request body (design §4.1, REQ-2.1, REQ-5.1, REQ-5.2) — one
 * recursive shape describing a whole task/subtask tree in a single request
 * (REQ-5.7).
 *
 * `z.lazy` is what makes the recursion possible: the schema refers to itself
 * inside `subtasks`, and a plain `z.object({...})` literal cannot reference
 * the very const it is being assigned to. `z.lazy` defers that reference to
 * parse time, by which point the binding exists. The explicit
 * `z.ZodType<…>` annotation is required for the same reason on the TypeScript
 * side — inference cannot resolve a type defined in terms of itself.
 *
 * Because it is one schema applied at every level, a malformed node is
 * rejected at *any* depth, not just the root: the same `title` and `skillIds`
 * rules run on a grandchild as on the top-level task.
 *
 * `skillIds` and `subtasks` are both optional and default to `[]`, so an
 * omitted field and an explicit empty array behave identically. An empty
 * `skillIds` is the trigger for LLM inference later (design §4.1), not a
 * validation failure now.
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
 * with its path (`subtasks.0.subtasks.1.title: …`). Without the path, a
 * failure deep inside a tree would report only "title must not be empty",
 * leaving the caller no way to tell *which* node of the tree was bad.
 */
export function formatValidationIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

/**
 * `PATCH /tasks/:id/assign` request body (design §4.1, REQ-2.4). `assigneeId`
 * is nullable so the same endpoint unassigns a task by passing `null`.
 */
export const assignTaskSchema = z.object({
  assigneeId: z.number().int('assigneeId must be an integer').nullable(),
});

export type AssignTaskRequest = z.infer<typeof assignTaskSchema>;

/**
 * `PATCH /tasks/:id/status` request body (design §4.1, REQ-2.5). `z.enum`
 * rejects any value outside the three statuses REQ-1.6 fixes, matching the
 * database's own `task_status` ENUM. The recursive Done rule (REQ-5.3) is not
 * expressible here — it depends on other rows — so the route applies it
 * separately via `countBlockingDescendants` (design §4.3).
 */
export const updateTaskStatusSchema = z.object({
  status: z.enum(['To-do', 'In Progress', 'Done'], {
    message: 'status must be one of: To-do, In Progress, Done',
  }),
});

export type UpdateTaskStatusRequest = z.infer<typeof updateTaskStatusSchema>;
