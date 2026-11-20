import type { Response } from 'express';
/** Standard success envelope: { data, meta? }. Errors use { error: { code, message, details? } }. */
export const ok = (res: Response, data: unknown, status = 200, meta?: Record<string, unknown>) => res.status(status).json(meta ? { data, meta } : { data });
