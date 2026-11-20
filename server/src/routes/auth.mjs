import { ApiError } from '../lib/errors.mjs';
import { validator } from '../lib/validate.mjs';
import { dummyVerify, hashPassword, hashToken, newToken, safeEqual, verifyPassword } from '../lib/crypto.mjs';
import { isValidSemester, legacyLevelForStorage } from '../domain/academic.mjs';
import { validateYears } from '../domain/years.mjs';
import { isUnique, nowIso } from '../db.mjs';
import { q, userDto } from '../dto.mjs';
import { clearCookie, createSession, getSettings, sessionCookie } from '../services.mjs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const checkPassword = (v, f, val) => { if (typeof val !== 'string') v.issue(f, 'Must be text.'); else if (val.length < 10) v.issue(f, 'Use at least 10 characters.'); else if (val.length > 128) v.issue(f, 'Use at most 128 characters.'); };
const fieldIssues = (v, errs) => { for (const [f, m] of Object.entries(errs)) v.issue(f, m); };

export function register(r) {
  r.add('GET', '/academic-settings', { auth: false }, ({ db }) => getSettings(db));
  r.add('GET', '/health', { auth: false }, ({ db }) => { q.get(db, 'SELECT 1 x'); return { status: 'ok', database: 'up', time: nowIso() }; });

  r.add('POST', '/auth/register', { auth: false, limit: ['register', 3600_000, 10, 'Too many sign-up attempts from this network. Please try again later.'] }, async ({ body, db, config, status, setCookie }) => {
    const v = validator(body); const d = {};
    d.name = v.str('name', { min: 2, max: 80 }); d.email = v.str('email', { max: 254, lower: true }); d.password = v.raw('password'); checkPassword(v, 'password', d.password);
    d.department = v.str('department', { min: 2, max: 120 }); d.branch = v.str('branch', { min: 2, max: 120, optional: true }); d.college = v.str('college', { min: 2, max: 160 }); d.enrollmentNumber = v.str('enrollmentNumber', { min: 1, max: 40, optional: true });
    d.enrollmentYear = v.int('enrollmentYear'); d.graduationYear = v.int('graduationYear'); d.currentSemester = v.int('currentSemester'); d.accountType = v.oneOf('accountType', ['JUNIOR','SENIOR','CANDIDATE']);
    if (d.email && !EMAIL.test(d.email)) v.issue('email', 'Enter a valid email address.');
    const settings = getSettings(db); if (d.currentSemester !== undefined && !isValidSemester(d.currentSemester, settings)) v.issue('currentSemester', `Must be a whole number from 1 to ${settings.maxSemester}.`);
    v.done(); // unknown fields such as accountRole or academicLevel are rejected here
    const yearErrs = validateYears(d); fieldIssues(v, yearErrs); v.done({ strict: false });
    const hash = await hashPassword(d.password); const legacyLevel = legacyLevelForStorage(); // compatibility-only column; account_type is the actual user-selected category
    let id;
    try { id = q.run(db, `INSERT INTO users (pid, name, email, pw_hash, role, department, branch, college, enrollment_number, enrollment_year, graduation_year, semester, level, account_type, account_type_selected) VALUES (?,?,?,?, 'STUDENT', ?,?,?,?,?,?,?,?,?,1)`,
      newToken().slice(0, 12), d.name, d.email, hash, d.department, d.branch ?? null, d.college, d.enrollmentNumber ?? null, d.enrollmentYear, d.graduationYear, d.currentSemester, legacyLevel, d.accountType).lastInsertRowid; }
    catch (e) { if (isUnique(e)) throw new ApiError(409, 'EMAIL_TAKEN', 'An account with this email already exists.'); throw e; }
    const s = createSession(db, config, Number(id)); setCookie(sessionCookie(config, s.token)); status(201);
    return { user: userDto(db, q.get(db, 'SELECT * FROM users WHERE id = ?', id)), csrfToken: s.csrf };
  });

  r.add('POST', '/auth/login', { auth: false, limit: ['login', 15 * 60_000, 10, 'Too many sign-in attempts. Please wait a few minutes and try again.'] }, async ({ body, db, config, setCookie }) => {
    const v = validator(body); const email = v.str('email', { max: 254, lower: true }); const password = v.raw('password'); if (typeof password !== 'string' || !password || password.length > 128) v.issue('password', 'Enter your password.'); v.done();
    const u = q.get(db, 'SELECT * FROM users WHERE email = ?', email);
    const ok = u ? await verifyPassword(u.pw_hash, password) : (await dummyVerify(password), false);
    if (!u || !ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.'); // identical for unknown email and wrong password
    q.run(db, 'DELETE FROM sessions WHERE user_id = ? AND expires_at < ?', u.id, Date.now());
    const s = createSession(db, config, u.id); setCookie(sessionCookie(config, s.token)); return { user: userDto(db, u), csrfToken: s.csrf };
  });

  r.add('POST', '/auth/logout', { auth: false }, ({ db, config, session, setCookie }) => { if (session) q.run(db, 'DELETE FROM sessions WHERE id = ?', session.id); setCookie(clearCookie(config)); return { loggedOut: true }; });
  r.add('GET', '/auth/me', { auth: true }, ({ db, user, session }) => ({ user: userDto(db, user), csrfToken: session.csrf }));

  r.add('POST', '/auth/change-password', { auth: true, limit: ['pw', 3600_000, 20] }, async ({ body, db, user, session }) => {
    const v = validator(body); const cur = v.raw('currentPassword'); const next = v.raw('newPassword'); checkPassword(v, 'newPassword', next); if (typeof cur !== 'string' || !cur) v.issue('currentPassword', 'Enter your current password.'); v.done();
    if (!(await verifyPassword(user.pw_hash, cur))) throw new ApiError(403, 'WRONG_PASSWORD', 'Your current password is incorrect.');
    q.run(db, 'UPDATE users SET pw_hash = ? WHERE id = ?', await hashPassword(next), user.id); q.run(db, 'DELETE FROM sessions WHERE user_id = ? AND id <> ?', user.id, session.id); // other devices are signed out
    return { changed: true };
  });

  r.add('POST', '/auth/forgot-password', { auth: false, limit: ['forgot', 3600_000, 5, 'Too many reset requests. Please try again later.'] }, async ({ body, db, config }) => {
    const v = validator(body); const email = v.str('email', { max: 254, lower: true }); v.done(); const u = q.get(db, 'SELECT * FROM users WHERE email = ?', email);
    if (u) { const token = newToken(); q.run(db, 'INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?,?,?)', hashToken(token, config.secret), u.id, Date.now() + 3600_000);
      if (config.printResetLinks) console.log(`[dev only] No email service is configured. Password reset link for ${u.email}: ${config.origin}/reset-password?token=${token}`); } // production must send this by email instead
    return { sent: true }; // same answer whether or not the account exists
  });

  r.add('POST', '/auth/reset-password', { auth: false, limit: ['reset', 3600_000, 10] }, async ({ body, db, config }) => {
    const v = validator(body); const token = v.str('token', { min: 10, max: 200 }); const pw = v.raw('password'); checkPassword(v, 'password', pw); v.done();
    const row = q.get(db, 'SELECT * FROM reset_tokens WHERE token_hash = ?', hashToken(token, config.secret));
    if (!row || row.used || row.expires_at < Date.now()) throw new ApiError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired. Please request a new one.');
    q.run(db, 'UPDATE users SET pw_hash = ? WHERE id = ?', await hashPassword(pw), row.user_id); q.run(db, 'UPDATE reset_tokens SET used = 1 WHERE token_hash = ?', row.token_hash); q.run(db, 'DELETE FROM sessions WHERE user_id = ?', row.user_id);
    return { reset: true };
  });

  const safeEq = safeEqual; void safeEq; // (kept for future token comparisons)
}
