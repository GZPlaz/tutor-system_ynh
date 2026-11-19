/**
 * Typed HTTP errors. Throw these from services/routes; the central error
 * handler (middleware/errorHandler.ts) turns them into consistent JSON:
 *
 *   { "error": { "code": "ACCOUNT_PENDING", "message": "...", "details": ... } }
 *
 * The `code` is stable and meant for the frontend to switch on; `message` is
 * human-readable and may change.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const BadRequest = (message = 'Bad request', details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const Unauthorized = (message = 'Authentication required', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);

export const Forbidden = (message = 'You do not have permission to do that', code = 'FORBIDDEN') =>
  new AppError(403, code, message);

export const NotFound = (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`);

export const Conflict = (message: string, code = 'CONFLICT', details?: unknown) => new AppError(409, code, message, details);
