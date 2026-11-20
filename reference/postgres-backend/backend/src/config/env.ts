import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url().optional(),
  DATABASE_URL_TEST: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  FRONTEND_ORIGIN: z.string().url(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(168),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_DISABLED: z.enum(['true', 'false']).default('false'),
});

export interface Env {
  nodeEnv: 'development' | 'test' | 'production'; isProduction: boolean; port: number; databaseUrl: string; sessionSecret: string;
  frontendOrigin: string; sessionTtlMs: number; cookieSameSite: 'lax' | 'strict' | 'none'; trustProxy: number; logLevel: string; rateLimitDisabled: boolean;
}
/** Validates configuration at startup so a bad setup fails fast with a readable message (never printing secret values). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) throw new Error(`Invalid environment configuration:\n${parsed.error.issues.map(i => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  const e = parsed.data; const isTest = e.NODE_ENV === 'test'; const isProd = e.NODE_ENV === 'production';
  const databaseUrl = isTest ? e.DATABASE_URL_TEST : e.DATABASE_URL;
  if (!databaseUrl) throw new Error(isTest ? 'DATABASE_URL_TEST is required when NODE_ENV=test' : 'DATABASE_URL is required');
  if (isTest && !/test/i.test(new URL(databaseUrl).pathname)) throw new Error('Refusing to run tests: the test database name must contain "test" so real data is never touched.');
  if (e.RATE_LIMIT_DISABLED === 'true' && !isTest) throw new Error('RATE_LIMIT_DISABLED is only allowed when NODE_ENV=test');
  if (isProd) {
    if (!e.FRONTEND_ORIGIN.startsWith('https://')) throw new Error('FRONTEND_ORIGIN must use https in production');
    if (/replace|change|example|secret/i.test(e.SESSION_SECRET)) throw new Error('SESSION_SECRET looks like a placeholder; generate a random value');
  }
  if (e.COOKIE_SAMESITE === 'none' && !isProd) throw new Error('COOKIE_SAMESITE=none requires Secure cookies, so it is only allowed in production');
  return { nodeEnv: e.NODE_ENV, isProduction: isProd, port: e.PORT, databaseUrl, sessionSecret: e.SESSION_SECRET, frontendOrigin: new URL(e.FRONTEND_ORIGIN).origin,
    sessionTtlMs: e.SESSION_TTL_HOURS * 3600_000, cookieSameSite: e.COOKIE_SAMESITE, trustProxy: e.TRUST_PROXY, logLevel: e.LOG_LEVEL, rateLimitDisabled: e.RATE_LIMIT_DISABLED === 'true' };
}
