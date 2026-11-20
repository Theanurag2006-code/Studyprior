import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);
const N = 16384, R = 8, P = 1, KEYLEN = 64; // scrypt cost parameters (OWASP-acceptable for interactive logins)
/** Stored as  scrypt$N$r$p$salt$hash  (all base64url). Plain passwords are never stored or logged. */
export async function hashPassword(plain) {
  const salt = randomBytes(16); const key = await scryptAsync(plain.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function verifyPassword(stored, plain) {
  try {
    const [alg, n, r, p, salt, hash] = stored.split('$'); if (alg !== 'scrypt') return false; const expected = Buffer.from(hash, 'base64url');
    const key = await scryptAsync(plain.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
    return timingSafeEqual(key, expected);
  } catch { return false; }
}
let dummy; /** Burns the same time as a real check so "unknown email" and "wrong password" look alike. */
export async function dummyVerify(plain) { dummy ??= await hashPassword('timing-equalisation-only'); await verifyPassword(dummy, plain); }
export const newToken = () => randomBytes(32).toString('base64url');
export const newId = () => randomUUID();
export const newCsrf = () => randomBytes(32).toString('hex');
export const shortId = () => randomBytes(9).toString('base64url');
/** The database stores only this keyed hash of a token, so a leaked database cannot be replayed as logins. */
export const hashToken = (token, secret) => createHmac('sha256', secret).update(token).digest('hex');
export const safeEqual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
