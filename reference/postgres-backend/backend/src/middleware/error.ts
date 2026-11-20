import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors';
import type { Logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (_req, res) => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }); };
/** Turns every failure into the standard { error: { code, message, details? } } shape without leaking internals. */
export const errorHandler = (logger: Logger, isProd: boolean): ErrorRequestHandler => (err, req, res, _next) => {
  const send = (status: number, code: string, message: string, details?: unknown) => res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId: req.id } });
  if (err instanceof ZodError) return send(422, 'VALIDATION_ERROR', 'Request validation failed.', err.issues.map(i => ({ field: i.path.join('.') || 'body', message: i.message })));
  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err?.type === 'entity.parse.failed') return send(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  if (err?.type === 'entity.too.large') return send(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return send(409, 'CONFLICT', 'That already exists.');
    if (err.code === 'P2025') return send(404, 'NOT_FOUND', 'Not found.');
  }
  logger.error({ requestId: req.id, err: { name: err?.name, code: err?.code, ...(isProd ? {} : { stack: err?.stack }) } }, 'unhandled error'); // no bodies, no query strings, no message text that could echo user input
  return send(500, 'INTERNAL_ERROR', 'Something went wrong on our side. Please try again.');
};
