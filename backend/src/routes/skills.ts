import { Router } from 'express';
import { pool } from '../db/pool.js';
import { getAllSkills } from '../db/skills.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const skillsRouter: Router = Router();

// REQ-2.8
skillsRouter.get(
  '/skills',
  asyncHandler(async (_req, res) => {
    const skills = await getAllSkills(pool);
    res.status(200).json(skills);
  }),
);
