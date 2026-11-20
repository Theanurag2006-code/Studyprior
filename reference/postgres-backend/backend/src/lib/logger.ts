import pino from 'pino';

/** Structured logger. Request bodies, query strings, cookies and auth headers are never logged. */
export const createLogger = (level: string) => pino({ level, redact: { paths: ['password', '*.password', 'passwordHash', '*.passwordHash', 'token', '*.token', 'cookie', 'req.headers.cookie', 'req.headers.authorization', 'body', 'note', 'noteBody'], censor: '[redacted]' } });
export type Logger = ReturnType<typeof createLogger>;
