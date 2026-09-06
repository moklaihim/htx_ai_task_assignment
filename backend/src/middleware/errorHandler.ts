import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError.js';

/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * pipeline via `next(err)` instead of becoming an unhandled rejection (Express
 * does not await handlers itself).
 */
export function asyncHandler<Req extends Request = Request>(
  fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Req, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Central error handler: every failure — expected (`AppError`) or not — is
 * funneled through here so the response shape is
 * `{ error: { code, message } }` everywhere.
 *
 * Must be registered last, after every route, per Express's convention for
 * recognizing error-handling middleware by its four-argument arity.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- `next` is required for Express to treat this as an error handler.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  console.error('unhandled error:', message);
  res.status(500).json({ error: { code: 'VALIDATION_ERROR', message: 'Internal server error' } });
}
