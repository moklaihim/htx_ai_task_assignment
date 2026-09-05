import express, { type Express } from 'express';
import { healthRouter } from './routes/health.js';
import { skillsRouter } from './routes/skills.js';
import { developersRouter } from './routes/developers.js';
import { AppError } from './errors/AppError.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(healthRouter);
  app.use(skillsRouter);
  app.use(developersRouter);

  // Any path not matched by a route above (design §4.1: consistent error shape
  // across all routes, not just ones that reach a handler).
  app.use((req, _res, next) => {
    next(AppError.notFound(`No route for ${req.method} ${req.path}`));
  });

  // Must be registered after every route (see errorHandler.ts).
  app.use(errorHandler);

  return app;
}
