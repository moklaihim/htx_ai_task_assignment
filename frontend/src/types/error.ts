// Mirrors backend/src/types/error.ts exactly — see task.ts for why this is a
// hand-kept copy rather than a cross-package import.

/** The four error codes used across every endpoint. */
export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'SKILL_MISMATCH' | 'SUBTASKS_NOT_DONE';

/**
 * The error response shape every route returns on failure:
 * `{ error: { code, message } }`. `code` is machine-readable so the frontend
 * can branch on failure type; `message` is what gets shown to the user.
 */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
  };
}
