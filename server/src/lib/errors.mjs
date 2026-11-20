/** Errors safe to show to clients. Anything else becomes a generic 500. */
export class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; }
}
export const unauthorized = (m = 'Sign in required.') => new ApiError(401, 'UNAUTHENTICATED', m);
export const forbidden = (m = 'You do not have permission to do that.') => new ApiError(403, 'FORBIDDEN', m);
export const notFound = (m = 'Not found.') => new ApiError(404, 'NOT_FOUND', m);
export const conflict = (code, m) => new ApiError(409, code, m);
