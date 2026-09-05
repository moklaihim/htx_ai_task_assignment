import { Router } from 'express';
import { checkDbConnection } from '../db/pool.js';

export const healthRouter: Router = Router();

healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

healthRouter.get('/health/db', async (_req, res) => {
  try {
    await checkDbConnection();
    res.status(200).json({ status: 'ok', db: 'up' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('db health check failed:', message);
    res.status(503).json({ status: 'error', db: 'down' });
  }
});
