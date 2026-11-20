import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Reads and validates configuration. Fails fast with a readable message; never prints secret values. */
export function loadConfig(env = process.env, o = {}) {
  const nodeEnv = o.nodeEnv ?? env.NODE_ENV ?? 'development'; const isProd = nodeEnv === 'production'; const isTest = nodeEnv === 'test';
  const dbPath = o.dbPath ?? env.DB_PATH ?? 'data/studyprior.db';
  let secret = o.sessionSecret ?? env.SESSION_SECRET;
  if (!secret) {
    if (isProd) throw new Error('SESSION_SECRET is required in production (32+ random characters).');
    secret = devSecret(dbPath); // convenience for local development only: generated once, kept next to the database, never committed
  }
  if (secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters.');
  const origin = new URL(o.frontendOrigin ?? env.FRONTEND_ORIGIN ?? 'http://localhost:5173').origin;
  if (isProd && !origin.startsWith('https://')) throw new Error('FRONTEND_ORIGIN must use https in production.');
  return {
    nodeEnv, isProd, isTest, port: Number(o.port ?? env.PORT ?? 4000), dbPath, secret, origin,
    cookieSecure: isProd || env.COOKIE_SECURE === 'true', sameSite: env.COOKIE_SAMESITE === 'none' && isProd ? 'None' : 'Lax',
    sessionTtlMs: 7 * 864e5, trustProxy: env.TRUST_PROXY === 'true',
    requireSubjectReview: o.requireSubjectReview ?? env.REQUIRE_SUBJECT_REVIEW === 'true', // true: community subjects wait for admin approval
    rateLimit: o.rateLimit ?? (!isTest && env.RATE_LIMIT_DISABLED !== 'true'),
    printResetLinks: o.printResetLinks ?? !isProd, // no email service is configured: in development the reset link is printed to this console
  };
}
function devSecret(dbPath) {
  if (dbPath === ':memory:') return randomBytes(32).toString('hex');
  const file = join(dirname(dbPath), '.dev-session-secret'); mkdirSync(dirname(dbPath), { recursive: true });
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const s = randomBytes(32).toString('hex'); writeFileSync(file, s, { mode: 0o600 }); return s;
}
