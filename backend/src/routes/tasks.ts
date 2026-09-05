import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getAllTaskRows, getTaskTreeRows, insertTaskTree, updateTaskAssignee, updateTaskStatus } from '../db/tasks.js';
import { findMissingSkillIds } from '../db/skills.js';
import { getDeveloperById } from '../db/developers.js';
import { buildForest } from '../services/buildForest.js';
import { collectSkillIds } from '../services/collectSkillIds.js';
import { developerCanBeAssigned } from '../services/developerCanBeAssigned.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../errors/AppError.js';
import {
  assignTaskSchema,
  createTaskSchema,
  formatValidationIssues,
  updateTaskStatusSchema,
} from '../schemas/task.js';

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

// REQ-2.1, REQ-5.7 — the whole task/subtask tree, created in one request and
// one transaction (design §4.5).
tasksRouter.post(
  '/tasks',
  asyncHandler(async (req, res) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.validation(formatValidationIssues(parsed.error));
    }

    const root = parsed.data;

    // Every skill id in the tree, not just the root's — otherwise a bad id on
    // a grandchild would only surface as a foreign-key error mid-transaction.
    const missing = await findMissingSkillIds(pool, collectSkillIds(root));
    if (missing.length > 0) {
      throw AppError.validation(`Unknown skill id(s): ${missing.join(', ')}`);
    }

    const taskId = await insertTaskTree(pool, root);
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
      throw AppError.validation(formatValidationIssues(parsed.error));
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

// REQ-2.5 (partial) — no subtask/`SUBTASKS_NOT_DONE` check yet; nothing can
// have subtasks until phase 5 (design §4.3 is implemented then).
tasksRouter.patch(
  '/tasks/:id/status',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw AppError.validation(`Invalid task id: ${req.params.id}`);
    }

    const parsed = updateTaskStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw AppError.validation(formatValidationIssues(parsed.error));
    }
    const { status } = parsed.data;

    const existingRows = await getTaskTreeRows(pool, id);
    const task = existingRows.find((row) => row.id === id);
    if (!task) {
      throw AppError.notFound(`No task with id ${id}`);
    }

    await updateTaskStatus(pool, id, status);

    const updatedRows = await getTaskTreeRows(pool, id);
    const [updated] = buildForest(updatedRows);
    res.status(200).json(updated);
  }),
);
