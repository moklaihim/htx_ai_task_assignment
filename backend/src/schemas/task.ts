import { z } from 'zod';

/**
 * `POST /tasks` request body (design §4.1, REQ-2.1 — partial: title and
 * `skillIds` only, no `subtasks` yet; that arrives in phase 5).
 *
 * `skillIds` defaults to `[]` so an omitted field and an explicit empty array
 * behave identically — both are the trigger for LLM inference later (design
 * §4.1), not a validation failure now.
 */
export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'title must not be empty'),
  skillIds: z.array(z.number().int('skillIds must contain integers')).optional().default([]),
});

export type CreateTaskRequest = z.infer<typeof createTaskSchema>;

/**
 * `PATCH /tasks/:id/assign` request body (design §4.1, REQ-2.4). `assigneeId`
 * is nullable so the same endpoint unassigns a task by passing `null`.
 */
export const assignTaskSchema = z.object({
  assigneeId: z.number().int('assigneeId must be an integer').nullable(),
});

export type AssignTaskRequest = z.infer<typeof assignTaskSchema>;

/**
 * `PATCH /tasks/:id/status` request body (design §4.1, REQ-2.5 — partial: no
 * subtask/`SUBTASKS_NOT_DONE` check yet, since nothing can have subtasks
 * until phase 5). `z.enum` rejects any value outside the three statuses
 * REQ-1.6 fixes, matching the database's own `task_status` ENUM.
 */
export const updateTaskStatusSchema = z.object({
  status: z.enum(['To-do', 'In Progress', 'Done'], {
    message: 'status must be one of: To-do, In Progress, Done',
  }),
});

export type UpdateTaskStatusRequest = z.infer<typeof updateTaskStatusSchema>;
