import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import type { Env } from '../config/env';
import { safeEqual } from '../lib/crypto';
import { forbidden, unauthorized } from '../lib/errors';
import { hashToken } from '../lib/crypto';
import type { PrismaClient } from '@prisma/client';
import { SESSION_COOKIE } from '../services/sessions';

/** Loads the signed-in user (if any) from the HttpOnly cookie. Never trusts anything the client sends about role or level. */
export const authenticate = (prisma: PrismaClient, env: Env): RequestHandler => async (req, _res, next) => {
  try {
    const raw = req.cookies?.[SESSION_COOKIE]; if (typeof raw !== 'string' || !raw) return next();
    const s = await prisma.session.findUnique({ where: { tokenHash: hashToken(raw, env.sessionSecret) }, include: { user: true } });
    if (!s) return next();
    if (s.expiresAt <= new Date()) { await prisma.session.deleteMany({ where: { id: s.id } }); return next(); }
    if (Date.now() - s.lastSeenAt.getTime() > 5 * 60_000) await prisma.session.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } });
    req.auth = { sessionId: s.id, csrfToken: s.csrfToken, user: s.user }; next();
  } catch (e) { next(e); }
};
export const requireAuth: RequestHandler = (req, _res, next) => next(req.auth ? undefined : unauthorized());
export const requireAdmin: RequestHandler = (req, _res, next) => next(!req.auth ? unauthorized() : req.auth.user.accountRole === 'ADMIN' ? undefined : forbidden());

/**
 * CSRF defence for cookie sessions (layered):
 * 1) SameSite cookies, 2) any Origin header must equal the configured frontend origin,
 * 3) every state-changing request from a signed-in session must carry that session's X-CSRF-Token.
 */
export const csrfProtection = (env: Env): RequestHandler => (req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin'); if (origin && origin !== env.frontendOrigin) return next(forbidden('Cross-site request blocked.'));
  if (req.auth) { const t = req.get('x-csrf-token'); if (!t || !safeEqual(t, req.auth.csrfToken)) return next(forbidden('Missing or invalid CSRF token.')); }
  next();
};
const limiter = (env: Env, windowMs: number, limit: number, message: string) => rateLimit({ windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => env.rateLimitDisabled,
  handler: (_req, res) => { res.status(429).json({ error: { code: 'RATE_LIMITED', message } }); } });
export const limiters = (env: Env) => ({
  api: limiter(env, 15 * 60_000, 600, 'Too many requests. Please slow down.'),
  login: limiter(env, 15 * 60_000, 10, 'Too many sign-in attempts. Please wait a few minutes and try again.'),
  register: limiter(env, 60 * 60_000, 10, 'Too many sign-up attempts from this network. Please try again later.'),
});
