import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { PrismaClient } from '@prisma/client';
import type { Env } from './config/env';
import type { Logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authenticate, csrfProtection, limiters } from './middleware/security';
import { buildRouter } from './routes';

export function createApp({ prisma, env, logger }: { prisma: PrismaClient; env: Env; logger: Logger }) {
  const app = express(); app.disable('x-powered-by'); if (env.trustProxy) app.set('trust proxy', env.trustProxy);
  app.use((req, res, next) => { req.id = randomUUID(); res.setHeader('X-Request-Id', req.id); const t = Date.now();
    res.on('finish', () => logger.info({ requestId: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - t }, 'request')); next(); }); // path only: no query, headers or body
  app.use(helmet());
  app.use(cors({ origin: (origin, cb) => cb(null, !origin || origin === env.frontendOrigin), credentials: true, methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'], maxAge: 600 })); // one explicit origin, never '*'
  app.use(express.json({ limit: '100kb' })); app.use(cookieParser());
  app.use('/api/v1', limiters(env).api, authenticate(prisma, env), csrfProtection(env), buildRouter(prisma, env));
  app.use(notFoundHandler); app.use(errorHandler(logger, env.isProduction));
  return app;
}
