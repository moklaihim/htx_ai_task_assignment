/** The four error codes used across every endpoint (design §4.1). */
export type ErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'SKILL_MISMATCH' | 'SUBTASKS_NOT_DONE';

/**
 * The error response shape every route returns on failure (design §4.1):
 * `{ error: { code, message } }`. `code` is machine-readable so the frontend can
 * branch on failure type; `message` is what gets shown to the user.
 */
export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
  };
}
