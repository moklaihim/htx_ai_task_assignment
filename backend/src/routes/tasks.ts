import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getAllTaskRows, getTaskTreeRows, insertFlatTask } from '../db/tasks.js';
import { findMissingSkillIds } from '../db/skills.js';
import { buildForest } from '../services/buildForest.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../errors/AppError.js';
import { createTaskSchema } from '../schemas/task.js';

export const tasksRouter: Router = Router();

// REQ-2.2 — top-level tasks only, each with its subtasks nested inside.
tasksRouter.get(
  '/tasks',
  asyncHandler(async (_req, res) => {
    const rows = await getAllTaskRows(pool);
    res.status(200).json(buildForest(rows));
  }),
);

// REQ-2.3
tasksRouter.get(
  '/tasks/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw AppError.validation(`Invalid task id: ${req.params.id}`);
    }

    const rows = await getTaskTreeRows(pool, id);
    if (rows.length === 0) {
      throw AppError.notFound(`No task with id ${id}`);
    }

    const [root] = buildForest(rows);
    res.status(200).json(root);
  }),
);

// REQ-2.1 (partial) — title + skillIds only; subtasks arrive in phase 5.
tasksRouter.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      throw AppError.validation(message);
    }

    const { title, skillIds } = parsed.data;

    const missing = await findMissingSkillIds(pool, skillIds);
    if (missing.length > 0) {
      throw AppError.validation(`Unknown skill id(s): ${missing.join(', ')}`);
    }

    const taskId = await insertFlatTask(pool, title, skillIds);
    const rows = await getTaskTreeRows(pool, taskId);
    const [task] = buildForest(rows);

    res.status(201).json(task);
  }),
);
