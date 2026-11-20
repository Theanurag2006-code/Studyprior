import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Client, YEAR, makeAdmin, regBody, signUp, start } from './helpers.mjs';

let app; before(async () => { app = await start(); }); after(() => app.close());

test('health, settings, unknown routes and bad input use the standard shapes', async () => {
  const c = new Client(app.base);
  const h = await c.get('/health'); assert.equal(h.status, 200); assert.deepEqual([h.data.status, h.data.database], ['ok', 'up']); assert.doesNotMatch(h.text, /secret|password|\.db/i);
  assert.deepEqual((await c.get('/academic-settings')).data, { maxSemester: 8, helperMinSemester: 3 });
  const nf = await c.get('/nope'); assert.equal(nf.status, 404); assert.equal(nf.error.code, 'NOT_FOUND');
  assert.equal((await c.req('DELETE', '/health', {})).status, 405);
  const bad = await c.req('POST', '/auth/login', '{not json'); assert.equal(bad.status, 400); assert.equal(bad.error.code, 'INVALID_JSON');
  const big = await c.req('POST', '/auth/login', JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(200_000) })); assert.equal(big.status, 413);
});
test('security headers are present and CORS allows only the configured origin', async () => {
  const c = new Client(app.base); const r = await c.get('/health'); assert.equal(r.headers.get('x-content-type-options'), 'nosniff'); assert.match(r.headers.get('content-security-policy'), /default-src 'none'/); assert.equal(r.headers.get('cache-control'), 'no-store');
  const ok = await fetch(app.base + '/auth/login', { method: 'OPTIONS', headers: { Origin: app.config.origin, 'Access-Control-Request-Method': 'POST' } }); assert.equal(ok.status, 204); assert.equal(ok.headers.get('access-control-allow-origin'), app.config.origin); assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
  const bad = await fetch(app.base + '/auth/login', { method: 'OPTIONS', headers: { Origin: 'http://evil.test', 'Access-Control-Request-Method': 'POST' } }); assert.equal(bad.headers.get('access-control-allow-origin'), null);
});
test('registration creates a student, sets a safe cookie and never returns secrets', async () => {
  const { res, c } = await signUp(app); assert.equal(res.status, 201); assert.equal(res.data.user.role, 'STUDENT'); assert.equal(res.data.user.accountType, 'Junior'); assert.equal(res.data.user.accountTypeSelected, true);
  assert.match(c.lastSetCookie, /HttpOnly/i); assert.match(c.lastSetCookie, /SameSite=Lax/i); assert.doesNotMatch(res.text, /pw_hash|scrypt\$|password/i);
  const row = app.db.prepare('SELECT * FROM users WHERE email = ?').get(res.data.user.email); assert.match(row.pw_hash, /^scrypt\$/); assert.doesNotMatch(row.pw_hash, /correct-horse/);
  const s = app.db.prepare('SELECT * FROM sessions').all().at(-1); assert.notEqual(s.token_hash, c.cookies.sp_session); assert.equal(s.token_hash.length, 64); // only a keyed hash of the token is stored
});
test('registration cannot create admins or choose a level, and validates everything', async () => {
  const c = new Client(app.base);
  for (const extra of [{ role: 'ADMIN' }, { accountRole: 'ADMIN' }, { level: 'SENIOR' }, { academicLevel: 'SENIOR' }]) { const r = await c.post('/auth/register', regBody(extra)); assert.equal(r.status, 422, JSON.stringify(extra)); assert.equal(r.error.code, 'VALIDATION_ERROR'); }
  assert.equal(app.db.prepare("SELECT count(*) c FROM users WHERE role = 'ADMIN'").get().c, 0);
  for (const currentSemester of [0, 9, -1, 2.5]) assert.equal((await c.post('/auth/register', regBody({ currentSemester }))).status, 422);
  assert.equal((await c.post('/auth/register', regBody({ password: 'short' }))).error.details[0].field, 'password');
  assert.equal((await c.post('/auth/register', regBody({ email: 'not-an-email' }))).status, 422);
  assert.equal((await c.post('/auth/register', regBody({ enrollmentYear: YEAR + 1, graduationYear: YEAR }))).status, 422);
  const independent = await signUp(app, { currentSemester: 6, accountType: 'JUNIOR', enrollmentYear: YEAR - 3, graduationYear: YEAR + 1 }); assert.equal(independent.user.accountType, 'Junior'); assert.equal(independent.user.semester, 6);
  const seniorInSem1 = await signUp(app, { currentSemester: 1, accountType: 'SENIOR', enrollmentYear: YEAR, graduationYear: YEAR + 4 }); assert.equal(seniorInSem1.user.accountType, 'Senior'); assert.equal(seniorInSem1.user.semester, 1);
  const first = regBody(); assert.equal((await c.post('/auth/register', first)).status, 201); const dup = await c.post('/auth/register', { ...first, email: first.email.toUpperCase() }); assert.equal(dup.status, 409); assert.equal(dup.error.code, 'EMAIL_TAKEN');
});
test('login, session, logout and CSRF', async () => {
  const { c, body } = await signUp(app); assert.equal((await c.get('/auth/me')).data.user.email, body.email);
  assert.equal((await c.post('/auth/logout', {}, { csrf: false })).status, 403); assert.equal((await c.get('/auth/me')).status, 200); // still signed in: CSRF header was missing
  assert.equal((await c.post('/auth/logout')).status, 200); assert.equal((await c.get('/auth/me')).status, 401); assert.equal(app.db.prepare('SELECT count(*) c FROM sessions WHERE user_id = (SELECT id FROM users WHERE email = ?)').get(body.email).c, 0);
  const evil = await new Client(app.base).post('/auth/login', { email: body.email, password: body.password }, { headers: { Origin: 'http://evil.test' } }); assert.equal(evil.status, 403);
  const a = await new Client(app.base).post('/auth/login', { email: body.email, password: 'wrong-password-1' }); const b = await new Client(app.base).post('/auth/login', { email: 'nobody@example.test', password: 'wrong-password-1' });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.deepEqual([a.error.code, a.error.message], [b.error.code, b.error.message]);
  assert.equal((await new Client(app.base).post('/auth/login', { email: body.email, password: body.password })).status, 200);
  for (const p of ['/auth/me', '/profile', '/catalog', '/me/state']) assert.equal((await new Client(app.base).get(p)).status, 401, p);
});
test('change password signs out other devices and rejects a wrong current password', async () => {
  const { c, body } = await signUp(app); const other = new Client(app.base); await other.post('/auth/login', { email: body.email, password: body.password });
  assert.equal((await c.post('/auth/change-password', { currentPassword: 'nope-nope-nope', newPassword: 'brand-new-password' })).status, 403);
  assert.equal((await c.post('/auth/change-password', { currentPassword: body.password, newPassword: 'short' })).status, 422);
  assert.equal((await c.post('/auth/change-password', { currentPassword: body.password, newPassword: 'brand-new-password' })).status, 200);
  assert.equal((await c.get('/auth/me')).status, 200); assert.equal((await other.get('/auth/me')).status, 401);
  assert.equal((await new Client(app.base).post('/auth/login', { email: body.email, password: body.password })).status, 401); assert.equal((await new Client(app.base).post('/auth/login', { email: body.email, password: 'brand-new-password' })).status, 200);
});
test('forgot/reset password: generic answer, single-use token, sessions revoked', async () => {
  const { c, body } = await signUp(app); const logs = []; const orig = console.log; console.log = m => logs.push(String(m)); app.config.printResetLinks = true;
  const known = await new Client(app.base).post('/auth/forgot-password', { email: body.email }); const unknown = await new Client(app.base).post('/auth/forgot-password', { email: 'ghost@example.test' });
  console.log = orig; app.config.printResetLinks = false; assert.deepEqual(known.data, unknown.data); assert.equal(logs.length, 1);
  const token = /token=([\w-]+)/.exec(logs[0])[1]; assert.equal(app.db.prepare('SELECT count(*) c FROM reset_tokens WHERE token_hash = ?').get(token).c, 0); // the raw token is not stored
  assert.equal((await new Client(app.base).post('/auth/reset-password', { token, password: 'short' })).status, 422);
  assert.equal((await new Client(app.base).post('/auth/reset-password', { token, password: 'fresh-password-123' })).status, 200);
  assert.equal((await c.get('/auth/me')).status, 401); assert.equal((await new Client(app.base).post('/auth/login', { email: body.email, password: 'fresh-password-123' })).status, 200);
  const again = await new Client(app.base).post('/auth/reset-password', { token, password: 'another-password-1' }); assert.equal(again.status, 400); assert.equal(again.error.code, 'INVALID_RESET_TOKEN');
  assert.equal((await new Client(app.base).post('/auth/reset-password', { token: 'x'.repeat(30), password: 'another-password-1' })).status, 400);
});
test('profile: allowed fields only; role, level, semester, email and password are refused', async () => {
  const { c, body } = await signUp(app);
  const ok = await c.patch('/profile', { name: '  New   Name ', bio: 'Hello', available: true, theme: 'dark', branch: 'Electronics', department: 'Applied Sciences' }); assert.equal(ok.status, 200); assert.deepEqual([ok.data.user.name, ok.data.user.available, ok.data.user.theme, ok.data.user.branch], ['New Name', true, 'dark', 'Electronics']);
  for (const bad of [{ role: 'ADMIN' }, { level: 'SENIOR' }, { accountType: 'SENIOR' }, { semester: 8 }, { currentSemester: 8 }, { email: 'x@example.test' }, { pw_hash: 'x' }, { password: 'new-password-123' }, { id: 'abc' }, {}]) assert.equal((await c.patch('/profile', bad)).status, 422, JSON.stringify(bad));
  assert.equal((await c.patch('/profile', { graduationYear: 2001 })).status, 422); assert.equal((await c.patch('/profile', { theme: 'system' })).status, 422); assert.equal((await c.patch('/profile', { bio: 'x'.repeat(301) })).status, 422);
  assert.equal((await c.patch('/profile', { bio: 'x' }, { csrf: false })).status, 403);
  assert.deepEqual(app.db.prepare('SELECT role, level, semester FROM users WHERE email = ?').get(body.email), { __proto__: null, role: 'STUDENT', level: 'JUNIOR', semester: 3 });
});
test('legacy accounts can confirm their user-selected account category once without changing semester', async () => {
  const { c, body, res } = await signUp(app, { accountType: 'JUNIOR', currentSemester: 6, enrollmentYear: YEAR - 3, graduationYear: YEAR + 1 });
  const id = app.db.prepare('SELECT id FROM users WHERE email = ?').get(body.email).id;
  app.db.prepare('UPDATE users SET account_type_selected = 0 WHERE id = ?').run(id);
  const changed = await c.patch('/profile', { accountType: 'CANDIDATE' });
  assert.equal(changed.status, 200); assert.equal(changed.data.user.accountType, 'Candidate'); assert.equal(changed.data.user.semester, 6);
  assert.equal((await c.patch('/profile', { accountType: 'SENIOR' })).status, 422);
  assert.deepEqual(app.db.prepare('SELECT account_type, account_type_selected, semester FROM users WHERE id = ?').get(id), { __proto__: null, account_type: 'CANDIDATE', account_type_selected: 1, semester: 6 });
  void res;
});

test('administrators have no academic status and cannot be edited into having one', async () => {
  const { c, res } = await makeAdmin(app); assert.equal(res.status, 200); assert.deepEqual([res.data.user.role, res.data.user.level, res.data.user.semester], ['ADMIN', null, 0]);
  assert.equal((await c.patch('/profile', { enrollmentYear: 2024 })).status, 422); assert.equal((await c.patch('/profile', { bio: 'Site admin' })).status, 200);
  assert.equal((await c.put('/me/saved-topics/anything')).status, 403); // student-only actions
});
test('sign-in and sign-up attempts are rate limited', async () => {
  const limited = await start({ rateLimit: true }); try {
    const c = new Client(limited.base); let last; for (let i = 0; i < 11; i++) last = await c.post('/auth/login', { email: 'a@b.co', password: 'wrong-wrong-1' }); assert.equal(last.status, 429); assert.equal(last.error.code, 'RATE_LIMITED');
  } finally { await limited.close(); }
});
