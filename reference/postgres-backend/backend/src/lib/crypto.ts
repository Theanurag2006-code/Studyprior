import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import * as argon2 from 'argon2';

// Argon2id with OWASP-recommended minimum parameters (19 MiB memory, 2 iterations, 1 lane).
const OPTS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
export const hashPassword = (plain: string) => argon2.hash(plain, OPTS);
export const verifyPassword = (hash: string, plain: string) => argon2.verify(hash, plain).catch(() => false);
let dummy: string | undefined;
/** Burns the same time as a real check so "unknown email" and "wrong password" look alike. */
export async function dummyVerify(plain: string): Promise<void> { dummy ??= await hashPassword('timing-equalisation-only'); await verifyPassword(dummy, plain); }
export const newToken = () => randomBytes(32).toString('base64url');
export const newCsrfToken = () => randomBytes(32).toString('hex');
/** The database stores only this HMAC, so a leaked database cannot be used to hijack sessions. */
export const hashToken = (token: string, secret: string) => createHmac('sha256', secret).update(token).digest('hex');
export function safeEqual(a: string, b: string): boolean { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
