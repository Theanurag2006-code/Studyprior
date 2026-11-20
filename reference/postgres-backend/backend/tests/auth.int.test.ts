import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, env, prisma, resetDb, reg, signUp } from './helpers';

beforeEach(resetDb); afterAll(() => prisma.$disconnect());
const year = new Date().getUTCFullYear();
const cookieOf = (res: request.Response) => ((res.headers['set-cookie'] as unknown as string[]) ?? []).join(';');

describe('registration', () => {
  it('creates a student, sets an HttpOnly SameSite cookie and never returns secrets', async () => {
    const { res } = await signUp(); expect(res.status).toBe(201);
    expect(cookieOf(res)).toMatch(/HttpOnly/i); expect(cookieOf(res)).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash|\$argon2/); expect(res.body.data.user.accountRole).toBe('STUDENT');
  });
  it('stores a hash of the password and only a hash of the session token', async () => {
    const { res, body } = await signUp(); const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/); expect(user.passwordHash).not.toContain(body.password);
    const raw = /sp_session=([^;]+)/.exec(cookieOf(res))![1]; const s = await prisma.session.findFirstOrThrow(); expect(s.tokenHash).not.toBe(raw); expect(s.tokenHash).toHaveLength(64);
  });
  it('cannot create an admin or choose an academic level', async () => {
    for (const extra of [{ accountRole: 'ADMIN' }, { academicLevel: 'SENIOR' }]) { const res = await request(app).post('/api/v1/auth/register').send(reg(extra)); expect(res.status).toBe(422); expect(res.body.error.code).toBe('VALIDATION_ERROR'); }
    expect(await prisma.user.count()).toBe(0);
  });
  it('derives the academic level on the server and rejects invalid semesters', async () => {
    expect((await signUp({ currentSemester: 3 })).res.body.data.user.academicLevel).toBe('JUNIOR');
    expect((await signUp({ currentSemester: 6, enrollmentYear: year - 3, graduationYear: year + 1 })).res.body.data.user.academicLevel).toBe('SENIOR');
    for (const currentSemester of [0, 9, -1, 2.5]) { const res = await request(app).post('/api/v1/auth/register').send(reg({ currentSemester })); expect(res.status).toBe(422); }
  });
  it('rejects duplicate emails and weak input with the standard error shape', async () => {
    const { body } = await signUp(); const dup = await request(app).post('/api/v1/auth/register').send(reg({ email: body.email.toUpperCase() })); expect(dup.status).toBe(409); expect(dup.body.error.code).toBe('EMAIL_TAKEN');
    const weak = await request(app).post('/api/v1/auth/register').send(reg({ password: 'short' })); expect(weak.status).toBe(422); expect(weak.body.error.details[0].field).toBe('password');
  });
});
describe('sessions', () => {
  it('persists across requests, then logout invalidates the session', async () => {
    const { agent, body, csrf } = await signUp(); const me = await agent.get('/api/v1/auth/me'); expect(me.status).toBe(200); expect(me.body.data.user.email).toBe(body.email.toLowerCase());
    const out = await agent.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf); expect(out.status).toBe(200);
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401); expect(await prisma.session.count()).toBe(0);
  });
  it('requires the CSRF token for state-changing requests and blocks foreign origins', async () => {
    const { agent } = await signUp(); expect((await agent.post('/api/v1/auth/logout')).status).toBe(403); expect((await agent.get('/api/v1/auth/me')).status).toBe(200);
    const evil = await request(app).post('/api/v1/auth/login').set('Origin', 'http://evil.test').send({ email: 'a@b.test', password: 'x' }); expect(evil.status).toBe(403);
  });
  it('rejects unauthenticated access cleanly', async () => {
    for (const path of ['/api/v1/auth/me', '/api/v1/profile']) { const res = await request(app).get(path); expect(res.status).toBe(401); expect(res.body.error.code).toBe('UNAUTHENTICATED'); }
  });
  it('treats unknown email and wrong password identically', async () => {
    const { body } = await signUp(); const a = await request(app).post('/api/v1/auth/login').send({ email: body.email, password: 'wrong-password-123' }); const b = await request(app).post('/api/v1/auth/login').send({ email: 'nobody@example.test', password: 'wrong-password-123' });
    expect(a.status).toBe(401); expect(b.status).toBe(401); expect(a.body.error).toEqual({ ...b.body.error, requestId: a.body.error.requestId }); expect((await request(app).post('/api/v1/auth/login').send({ email: body.email, password: body.password })).status).toBe(200);
  });
  it('allows CORS only for the configured frontend origin', async () => {
    const good = await request(app).options('/api/v1/auth/login').set('Origin', env.frontendOrigin).set('Access-Control-Request-Method', 'POST'); expect(good.headers['access-control-allow-origin']).toBe(env.frontendOrigin); expect(good.headers['access-control-allow-credentials']).toBe('true');
    const bad = await request(app).options('/api/v1/auth/login').set('Origin', 'http://evil.test').set('Access-Control-Request-Method', 'POST'); expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});
