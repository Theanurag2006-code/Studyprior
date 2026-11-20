import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { hashToken, newCsrfToken, newToken } from '../lib/crypto';

export const SESSION_COOKIE = 'sp_session';
export async function createSession(prisma: PrismaClient, env: Env, userId: string, userAgent?: string) {
  const token = newToken(); const csrfToken = newCsrfToken(); const expiresAt = new Date(Date.now() + env.sessionTtlMs);
  await prisma.session.create({ data: { tokenHash: hashToken(token, env.sessionSecret), userId, csrfToken, expiresAt, userAgent: userAgent?.slice(0, 200) } });
  return { token, csrfToken, expiresAt };
}
export const cookieOptions = (env: Env) => ({ httpOnly: true, secure: env.isProduction, sameSite: env.cookieSameSite, path: '/', maxAge: env.sessionTtlMs }) as const;
export const purgeExpiredSessions = (prisma: PrismaClient) => prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
