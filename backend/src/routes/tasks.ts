import { Router } from 'express';
import { pool } from '../db/pool.js';
import {
  countBlockingDescendants,
  getAllTaskRows,
  getTaskTreeRows,
  insertTaskTree,
  updateTaskAssignee,
  updateTaskStatus,
} from '../db/tasks.js';
import { findMissingSkillIds, getAllSkills } from '../db/skills.js';
import { getDeveloperById } from '../db/developers.js';
import { buildForest } from '../services/buildForest.js';
import { collectSkillIds } from '../services/collectSkillIds.js';
import {
  collectNodesNeedingSkills,
  inferMissingSkills,
  markInferenceOutcomes,
  type InferenceOutcome,
} from '../services/skillInference.js';
import { inferSkills } from '../llm/inferSkills.js';
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
// one transaction.
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

    // REQ-6.1, REQ-6.2, REQ-6.3 — nodes with no skills picked are classified by
    // the LLM. Done before `insertTaskTree` opens its transaction, so a slow
    // external API call doesn't pin a database connection. Successful ids are
    // written onto the nodes and persisted like a user-picked skill.
    const nodesNeedingSkills = collectNodesNeedingSkills(root);
    let outcomes: InferenceOutcome[] = [];
    if (nodesNeedingSkills.length > 0) {
      const seededSkills = await getAllSkills(pool);
      outcomes = await inferMissingSkills(nodesNeedingSkills, (title) =>
        inferSkills(title, seededSkills),
      );
    }

    // REQ-6.4 — inference failures are logged and flagged, never thrown: an
    // external API being down must not stop someone recording a task.
    // REQ-6.8's "not a software task" case is logged at `info`, not `warn`,
    // since nothing went wrong.
    for (const outcome of outcomes) {
      if (outcome.kind === 'failed') {
        console.warn(`llm: skill inference failed for "${outcome.title}": ${outcome.reason}`);
      } else if (outcome.kind === 'unclassifiable') {
        console.info(`llm: no skills inferred for "${outcome.title}": not a classifiable task`);
      }
    }

    const taskId = await insertTaskTree(pool, root);
    const rows = await getTaskTreeRows(pool, taskId);
    const [task] = buildForest(rows);

    // REQ-6.6, REQ-6.8, REQ-6.9 — response-only markers, applied after the
    // read so they never reach the database.
    markInferenceOutcomes(root, task!, outcomes);

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

// REQ-2.5, REQ-5.3 — a change to `Done` is rejected while any descendant, at
// any depth, is not `Done`. Other statuses skip the check entirely: nothing
// prevents moving a parent back to `To-do`.
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

    if (status === 'Done') {
      const blocking = await countBlockingDescendants(pool, id);
      if (blocking > 0) {
        const plural = blocking > 1 ? 's are' : ' is';
        throw AppError.subtasksNotDone(
          `Cannot mark "${task.title}" as Done: ${blocking} subtask${plural} not Done`,
        );
      }
    }

    await updateTaskStatus(pool, id, status);

    const updatedRows = await getTaskTreeRows(pool, id);
    const [updated] = buildForest(updatedRows);
    res.status(200).json(updated);
  }),
);
