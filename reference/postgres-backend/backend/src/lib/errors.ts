export interface FieldIssue { field: string; message: string }
/** Errors safe to show to clients. Anything else becomes a generic 500. */
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: FieldIssue[]) { super(message); this.name = 'AppError'; }
}
export const unauthorized = (msg = 'Sign in required.') => new AppError(401, 'UNAUTHENTICATED', msg);
export const forbidden = (msg = 'You do not have permission to do that.') => new AppError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Not found.') => new AppError(404, 'NOT_FOUND', msg);
export const validationError = (details: FieldIssue[]) => new AppError(422, 'VALIDATION_ERROR', 'Request validation failed.', details);
