import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDb, signUp } from './helpers';

beforeEach(resetDb); afterAll(() => prisma.$disconnect());
describe('profile', () => {
  it('updates allowed fields only', async () => {
    const { agent, csrf } = await signUp(); const res = await agent.patch('/api/v1/profile').set('X-CSRF-Token', csrf).send({ bio: 'Hello', availableForQuestions: true, themePreference: 'DARK' });
    expect(res.status).toBe(200); expect(res.body.data.user).toMatchObject({ bio: 'Hello', availableForQuestions: true, themePreference: 'DARK' });
  });
  it('cannot change role, level, semester, email or password', async () => {
    const { agent, csrf, body } = await signUp();
    for (const bad of [{ accountRole: 'ADMIN' }, { academicLevel: 'SENIOR' }, { currentSemester: 8 }, { email: 'x@example.test' }, { passwordHash: 'x' }, { password: 'new-password-123' }]) {
      const res = await agent.patch('/api/v1/profile').set('X-CSRF-Token', csrf).send(bad); expect(res.status).toBe(422);
    }
    const u = await prisma.user.findUniqueOrThrow({ where: { email: body.email.toLowerCase() } }); expect(u).toMatchObject({ accountRole: 'STUDENT', academicLevel: 'JUNIOR', currentSemester: 3 });
  });
  it('needs the CSRF token and rejects inconsistent years', async () => {
    const { agent, csrf } = await signUp(); expect((await agent.patch('/api/v1/profile').send({ bio: 'x' })).status).toBe(403);
    const res = await agent.patch('/api/v1/profile').set('X-CSRF-Token', csrf).send({ graduationYear: 2001 }); expect(res.status).toBe(422);
  });
});
