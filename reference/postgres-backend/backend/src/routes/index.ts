import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../config/env';
import { ok } from '../lib/http';
import { validateBody } from '../middleware/validate';
import { limiters, requireAuth } from '../middleware/security';
import { loginSchema, profileUpdateSchema, registerSchema } from '../schemas/auth';
import * as auth from '../services/auth';
import { getAcademicSettings } from '../services/academic';
import { cookieOptions, SESSION_COOKIE } from '../services/sessions';
import { toUserDto } from '../services/users';

export function buildRouter(prisma: PrismaClient, env: Env): Router {
  const r = Router(); const lim = limiters(env); const opts = cookieOptions(env);
  const startSession = (res: import('express').Response, session: { token: string }) => res.cookie(SESSION_COOKIE, session.token, opts);

  r.get('/health', async (_req, res) => {
    const up = await Promise.race([prisma.$queryRaw`SELECT 1`.then(() => true, () => false), new Promise<boolean>(r2 => setTimeout(() => r2(false), 2000))]);
    res.status(up ? 200 : 503).json({ data: { status: up ? 'ok' : 'degraded', database: up ? 'up' : 'down', time: new Date().toISOString() } }); // no connection strings, versions or error text
  });
  r.get('/academic-settings', async (_req, res, next) => { try { ok(res, await getAcademicSettings(prisma)); } catch (e) { next(e); } });

  r.post('/auth/register', lim.register, validateBody(registerSchema), async (req, res, next) => {
    try { const { user, session } = await auth.register(prisma, env, req.body, req.get('user-agent')); startSession(res, session); ok(res, { user, csrfToken: session.csrfToken }, 201); } catch (e) { next(e); }
  });
  r.post('/auth/login', lim.login, validateBody(loginSchema), async (req, res, next) => {
    try { const { user, session } = await auth.login(prisma, env, req.body, req.get('user-agent')); startSession(res, session); ok(res, { user, csrfToken: session.csrfToken }); } catch (e) { next(e); }
  });
  r.post('/auth/logout', async (req, res, next) => {
    try { if (req.auth) await auth.logout(prisma, req.auth.sessionId); res.clearCookie(SESSION_COOKIE, { ...opts, maxAge: undefined }); ok(res, { loggedOut: true }); } catch (e) { next(e); }
  });
  r.get('/auth/me', requireAuth, (req, res) => ok(res, { user: toUserDto(req.auth!.user), csrfToken: req.auth!.csrfToken }));
  r.get('/profile', requireAuth, (req, res) => ok(res, { user: toUserDto(req.auth!.user) }));
  r.patch('/profile', requireAuth, validateBody(profileUpdateSchema), async (req, res, next) => {
    try { ok(res, { user: await auth.updateProfile(prisma, req.auth!.user.id, req.body) }); } catch (e) { next(e); }
  });
  return r;
}
