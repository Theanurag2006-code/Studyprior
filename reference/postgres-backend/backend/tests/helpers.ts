import request from 'supertest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createPrisma } from '../src/db/prisma';
import { createLogger } from '../src/lib/logger';

// loadEnv refuses to run unless DATABASE_URL_TEST points at a database whose name contains "test".
export const env = loadEnv({ ...process.env, NODE_ENV: 'test', RATE_LIMIT_DISABLED: 'true' });
export const prisma = createPrisma(env.databaseUrl);
export const app = createApp({ prisma, env, logger: createLogger('silent') });
export const resetDb = () => prisma.$executeRawUnsafe('TRUNCATE TABLE "users", "subjects" RESTART IDENTITY CASCADE');
const year = new Date().getUTCFullYear();
export const reg = (over: Record<string, unknown> = {}) => ({ name: 'Test Student', email: `student${Math.random().toString(36).slice(2)}@example.test`, password: 'correct-horse-battery',
  department: 'Computer Science', college: 'Test University', enrollmentYear: year - 1, graduationYear: year + 3, currentSemester: 3, ...over });
export async function signUp(over: Record<string, unknown> = {}) {
  const agent = request.agent(app); const body = reg(over); const res = await agent.post('/api/v1/auth/register').send(body);
  return { agent, body, res, csrf: res.body.data?.csrfToken as string };
}
export async function makeTopic(name = 'Binary Trees') {
  const subject = await prisma.subject.create({ data: { name: 'Data Structures', nameNormalized: 'data structures', department: 'Computer Science', semester: 3 } });
  const unit = await prisma.unit.create({ data: { subjectId: subject.id, name: 'Trees', nameNormalized: 'trees', unitNumber: 1 } });
  const topic = await prisma.topic.create({ data: { subjectId: subject.id, unitId: unit.id, name, nameNormalized: name.toLowerCase() } });
  return { subject, unit, topic };
}
