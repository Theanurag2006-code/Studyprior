import { loadEnv } from './config/env';
import { createPrisma } from './db/prisma';
import { createApp } from './app';
import { createLogger } from './lib/logger';
import { purgeExpiredSessions } from './services/sessions';

const env = loadEnv(); const logger = createLogger(env.logLevel); const prisma = createPrisma(env.databaseUrl);
const server = createApp({ prisma, env, logger }).listen(env.port, () => logger.info({ port: env.port, mode: env.nodeEnv }, 'StudyPrior API listening'));
const sweep = setInterval(() => { purgeExpiredSessions(prisma).catch(() => undefined); }, 60 * 60_000); sweep.unref();
const stop = () => { clearInterval(sweep); server.close(() => { prisma.$disconnect().finally(() => process.exit(0)); }); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
