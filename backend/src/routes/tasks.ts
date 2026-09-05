import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getAllTaskRows, getTaskTreeRows, insertFlatTask, updateTaskAssignee } from '../db/tasks.js';
import { findMissingSkillIds } from '../db/skills.js';
import { getDeveloperById } from '../db/developers.js';
import { buildForest } from '../services/buildForest.js';
import { developerCanBeAssigned } from '../services/developerCanBeAssigned.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../errors/AppError.js';
import { assignTaskSchema, createTaskSchema } from '../schemas/task.js';

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

// REQ-2.4 — 400 SKILL_MISMATCH when the developer lacks a required skill;
// `assigneeId: null` unassigns unconditionally (no skill check needed to clear).
tasksRouter.patch(
  '/tasks/:id/assign',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw AppError.validation(`Invalid task id: ${req.params.id}`);
    }

    const parsed = assignTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join('; ');
      throw AppError.validation(message);
    }
    const { assigneeId } = parsed.data;

    const existingRows = await getTaskTreeRows(pool, id);
    const task = existingRows.find((row) => row.id === id);
    if (!task) {
      throw AppError.notFound(`No task with id ${id}`);
    }

    if (assigneeId !== null) {
      const developer = await getDeveloperById(pool, assigneeId);
      if (!developer) {
        throw AppError.notFound(`No developer with id ${assigneeId}`);
      }

      const taskSkillIds = task.skills.map((skill) => skill.id);
      const devSkillIds = developer.skills.map((skill) => skill.id);

      if (!developerCanBeAssigned(devSkillIds, taskSkillIds)) {
        const ownedSkillIds = new Set(devSkillIds);
        const missingNames = task.skills
          .filter((skill) => !ownedSkillIds.has(skill.id))
          .map((skill) => skill.name);
        const plural = missingNames.length > 1 ? 's' : '';
        throw AppError.skillMismatch(
          `${developer.name} does not have the required skill${plural}: ${missingNames.join(', ')}`,
        );
      }
    }

    await updateTaskAssignee(pool, id, assigneeId);

    const updatedRows = await getTaskTreeRows(pool, id);
    const [updated] = buildForest(updatedRows);
    res.status(200).json(updated);
  }),
);
