import type { ErrorCode } from '../types/error.js';

/**
 * Thrown by routes/services for any of the four documented failure codes
 * (design §4.1). Carries the HTTP status alongside the code so the error
 * middleware (`src/middleware/errorHandler.ts`) does not need a second
 * code → status lookup table that could drift out of sync with this one.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }

  static validation(message: string): AppError {
    return new AppError(400, 'VALIDATION_ERROR', message);
  }

  static notFound(message: string): AppError {
    return new AppError(404, 'NOT_FOUND', message);
  }

  static skillMismatch(message: string): AppError {
    return new AppError(400, 'SKILL_MISMATCH', message);
  }

  static subtasksNotDone(message: string): AppError {
    return new AppError(400, 'SUBTASKS_NOT_DONE', message);
  }
}
