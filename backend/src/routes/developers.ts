import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getAllDevelopers, getDeveloperById } from '../db/developers.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { AppError } from '../errors/AppError.js';

export const developersRouter: Router = Router();

// REQ-2.6
developersRouter.get(
  '/developers',
  asyncHandler(async (_req, res) => {
    const developers = await getAllDevelopers(pool);
    res.status(200).json(developers);
  }),
);

// REQ-2.7 — 404 on an unknown developer.
developersRouter.get(
  '/developers/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw AppError.validation(`Invalid developer id: ${req.params.id}`);
    }

    const developer = await getDeveloperById(pool, id);
    if (!developer) {
      throw AppError.notFound(`No developer with id ${id}`);
    }

    res.status(200).json(developer);
  }),
);
