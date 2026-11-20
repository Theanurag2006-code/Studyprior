import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { app, makeTopic, prisma, resetDb, signUp } from './helpers';
import { hashPassword } from '../src/lib/crypto';

beforeEach(resetDb); afterAll(() => prisma.$disconnect());
const rating = (userId: string, topicId: string, over = {}) => ({ userId, topicId, importance: 4, difficulty: 3, examRelevance: 4, interviewRelevance: 5, academicLevelAtSubmission: 'JUNIOR' as const, ...over });
const uid = async (email: string) => (await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } })).id;

describe('database constraints', () => {
  it('allows one rating per user per topic and keeps rating bounds', async () => {
    const { body } = await signUp(); const u = await uid(body.email); const { topic } = await makeTopic();
    await prisma.rating.create({ data: rating(u, topic.id) });
    await expect(prisma.rating.create({ data: rating(u, topic.id) })).rejects.toMatchObject({ code: 'P2002' });
    for (const bad of [{ importance: 0 }, { importance: 6 }, { difficulty: 9 }, { examRelevance: -1 }, { interviewRelevance: 6 }]) { await prisma.rating.deleteMany(); await expect(prisma.rating.create({ data: rating(u, topic.id, bad) })).rejects.toThrow(); }
  });
  it('enforces unique personal subject lists, saved topics and catalog names', async () => {
    const { body } = await signUp(); const u = await uid(body.email); const { subject, unit, topic } = await makeTopic();
    await prisma.userSubject.create({ data: { userId: u, subjectId: subject.id } }); await expect(prisma.userSubject.create({ data: { userId: u, subjectId: subject.id } })).rejects.toMatchObject({ code: 'P2002' });
    await prisma.savedTopic.create({ data: { userId: u, topicId: topic.id } }); await expect(prisma.savedTopic.create({ data: { userId: u, topicId: topic.id } })).rejects.toMatchObject({ code: 'P2002' });
    await expect(prisma.topic.create({ data: { subjectId: subject.id, unitId: unit.id, name: 'binary trees', nameNormalized: 'binary trees' } })).rejects.toMatchObject({ code: 'P2002' });
  });
  it('keeps the level snapshot when the student later changes semester', async () => {
    const { body } = await signUp(); const u = await uid(body.email); const { topic } = await makeTopic();
    await prisma.rating.create({ data: rating(u, topic.id, { academicLevelAtSubmission: 'JUNIOR' }) }); await prisma.user.update({ where: { id: u }, data: { currentSemester: 6, academicLevel: 'SENIOR' } });
    expect((await prisma.rating.findFirstOrThrow()).academicLevelAtSubmission).toBe('JUNIOR');
  });
  it('requires custom purpose text for OTHER and prevents double-counting plan completion', async () => {
    const { body } = await signUp(); const u = await uid(body.email); const { topic } = await makeTopic();
    const plan = (over = {}) => prisma.studyPlan.create({ data: { userId: u, topicId: topic.id, targetDate: new Date('2030-01-01'), ...over } });
    await expect(plan({ purpose: 'OTHER' })).rejects.toThrow(); await expect(plan({ purpose: 'EXAMS', customPurpose: 'x' })).rejects.toThrow(); const ok = await plan({ purpose: 'OTHER', customPurpose: 'Hackathon' });
    const act = () => prisma.studyActivity.create({ data: { userId: u, topicId: topic.id, studyPlanId: ok.id, activityType: 'PLAN_COMPLETED', minutes: 30, occurredOn: new Date('2030-01-01') } });
    await act(); await expect(act()).rejects.toMatchObject({ code: 'P2002' });
  });
});
describe('administrator accounts', () => {
  const adminData = async (over = {}) => ({ name: 'Admin', email: 'admin@example.test', passwordHash: await hashPassword('admin-passphrase-123'), accountRole: 'ADMIN' as const, department: 'Administration', college: 'StudyPrior', ...over });
  it('are stored without any academic status, and the database refuses inconsistent rows', async () => {
    const admin = await prisma.user.create({ data: await adminData() }); expect(admin).toMatchObject({ academicLevel: null, currentSemester: null, enrollmentYear: null, graduationYear: null });
    await expect(prisma.user.create({ data: await adminData({ email: 'a2@example.test', academicLevel: 'SENIOR' }) })).rejects.toThrow();
    await expect(prisma.user.create({ data: { ...(await adminData({ email: 'stu@example.test' })), accountRole: 'STUDENT' } })).rejects.toThrow();
  });
  it('sign in with a null academic level and cannot edit student-only fields', async () => {
    await prisma.user.create({ data: await adminData() }); const agent = request.agent(app);
    const login = await agent.post('/api/v1/auth/login').send({ email: 'admin@example.test', password: 'admin-passphrase-123' }); expect(login.status).toBe(200);
    expect(login.body.data.user).toMatchObject({ accountRole: 'ADMIN', academicLevel: null, currentSemester: null });
    const res = await agent.patch('/api/v1/profile').set('X-CSRF-Token', login.body.data.csrfToken).send({ enrollmentYear: 2024 }); expect(res.status).toBe(422);
  });
});
describe('privacy', () => {
  it('never exposes private notes, other users or secrets through the API', async () => {
    const { agent, body } = await signUp(); const u = await uid(body.email); await prisma.note.create({ data: { userId: u, title: 'Private', body: 'SECRET-NOTE-BODY' } });
    await signUp({ email: 'other@example.test' });
    for (const path of ['/api/v1/auth/me', '/api/v1/profile']) { const text = JSON.stringify((await agent.get(path)).body); expect(text).not.toContain('SECRET-NOTE-BODY'); expect(text).not.toContain('other@example.test'); expect(text).not.toMatch(/passwordHash|tokenHash|csrf_token|sessionSecret/); }
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });
});
