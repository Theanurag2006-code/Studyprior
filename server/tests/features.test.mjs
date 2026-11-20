import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Client, makeAdmin, makeSenior, rate, signUp, start, subjectBody } from './helpers.mjs';

let app; before(async () => { app = await start(); }); after(() => app.close());
const publish = async (c, over) => { const r = await c.post('/subjects', subjectBody(over)); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.data; };

test('publishing a subject is all-or-nothing, blocks duplicates, and appears in the catalog', async () => {
  const { c } = await signUp(app); const d = await publish(c);
  assert.equal(d.subject.status, 'PUBLISHED'); assert.equal(d.subject.ownerId, 'me'); assert.equal(d.topics.length, 3); assert.deepEqual(d.units.map(u => u.name).sort(), ['General', 'Trees']); // blank unit -> General, topics sharing a unit share it
  const dup = await c.post('/subjects', subjectBody({ name: '  data   STRUCTURES ' })); assert.equal(dup.status, 409); assert.equal(dup.error.code, 'DUPLICATE_SUBJECT');
  const half = await c.post('/subjects', subjectBody({ name: 'Algorithms', topics: [{ name: 'Sorting' }, { name: 'sorting ' }] })); assert.equal(half.status, 422); assert.equal(app.db.prepare("SELECT count(*) c FROM subjects WHERE name = 'Algorithms'").get().c, 0); // nothing half-created
  for (const bad of [{ topics: [] }, { name: 'ab' }, { semester: 9 }, { branch: '' }, { topics: [{ name: 'x' }] }, { topics: [{ name: 'Valid', hours: 500 }] }, { extra: 1 }]) assert.equal((await c.post('/subjects', subjectBody({ name: 'Other ' + Math.random(), ...bad }))).status, 422, JSON.stringify(bad));
  const cat = (await c.get('/catalog')).data; assert.equal(cat.subjects.length, 1); assert.equal(cat.topics.length, 3); assert.deepEqual(cat.subjects[0].branch, 'Computer Science');
  assert.ok((await c.get('/me/state')).data.user.savedSubjectIds.includes(d.subject.id)); // the creator's list includes it
});
test('adding a topic to an existing subject works, blocks duplicates and honours units', async () => {
  const { c } = await signUp(app); const d = await publish(c, { name: 'Operating Systems', topics: [{ name: 'Deadlocks', unit: 'Processes' }] });
  const t = await c.post(`/subjects/${d.subject.id}/topics`, { name: 'CPU Scheduling', unit: 'processes', hours: 3 }); assert.equal(t.status, 201); assert.equal(t.data.unit, undefined); assert.equal(t.data.topic.unitId, d.units[0].id); // existing unit reused (case-insensitive)
  const t2 = await c.post(`/subjects/${d.subject.id}/topics`, { name: 'Memory', unit: 'Storage' }); assert.equal(t2.status, 201); assert.equal(t2.data.unit.name, 'Storage');
  assert.equal((await c.post(`/subjects/${d.subject.id}/topics`, { name: ' cpu  scheduling' })).error.code, 'DUPLICATE_TOPIC'); assert.equal((await c.post('/subjects/nope/topics', { name: 'Anything' })).status, 404);
});
test('ratings: one per user per topic, edits update the same row, bounds enforced, level snapshot is derived', async () => {
  const owner = await signUp(app); const d = await publish(owner.c, { name: 'Databases', topics: [{ name: 'SQL Joins' }] }); const tid = d.topics[0].id;
  const junior = await signUp(app); const senior = await makeSenior(app);
  const a = await junior.c.post(`/topics/${tid}/ratings`, rate()); assert.equal(a.status, 201); assert.equal(a.data.level, 'Junior'); assert.equal(a.data.isMine, true);
  const b = await junior.c.post(`/topics/${tid}/ratings`, rate({ importance: 2, advice: 'Updated' })); assert.equal(b.status, 200); assert.equal(b.data.id, a.data.id);
  assert.equal(app.db.prepare('SELECT count(*) c FROM ratings WHERE topic_id = ?').get(tid).c, 1);
  assert.equal((await senior.c.post(`/topics/${tid}/ratings`, rate({ importance: 5 }))).data.level, 'Senior');
  for (const bad of [{ importance: 0 }, { importance: 6 }, { exam: 2.5 }, { interview: '4' }, { difficulty: null }, { level: 'SENIOR' }, { userId: 'x' }, { advice: 'x'.repeat(1001) }]) assert.equal((await junior.c.post(`/topics/${tid}/ratings`, rate(bad))).status, 422, JSON.stringify(bad));
  assert.equal((await junior.c.post('/topics/missing/ratings', rate())).status, 404);
  const cat = (await junior.c.get('/catalog')).data; const mine = cat.ratings.filter(r => r.isMine); assert.equal(cat.ratings.length, 2); assert.equal(mine.length, 1); assert.equal(mine[0].importance, 2);
  const people = Object.fromEntries(cat.contributors.map(p => [p.id, p])); assert.ok(cat.ratings.every(r => people[r.userId])); assert.doesNotMatch(JSON.stringify(cat), /@example\.test|pw_hash/); // no emails or secrets
  const sum = (await junior.c.get(`/topics/${tid}/summary`)).data; assert.equal(sum.overall.sampleCount, 2); assert.equal(sum.senior.sampleCount, 1); assert.equal(sum.junior.sampleCount, 1); assert.equal(sum.senior.priorityScore, 92);
  const lone = (await junior.c.get(`/topics/${(await publish(owner.c, { name: 'Empty Topic Subject', topics: [{ name: 'Nobody Rated' }] })).topics[0].id}/summary`)).data; assert.equal(lone.overall.priorityScore, null); assert.equal(lone.senior.message, 'No senior ratings yet.');
  const admin = await makeAdmin(app); assert.equal((await admin.c.post(`/topics/${tid}/ratings`, rate())).status, 403); // admins are not students
});
test('moderation mode: new subjects stay private until an admin approves them', async () => {
  const mod = await start({ requireSubjectReview: true }); try {
    const owner = await signUp(mod); const other = await signUp(mod); const admin = await makeAdmin(mod);
    const d = (await owner.c.post('/subjects', subjectBody({ name: 'Needs Review' }))).data; assert.equal(d.subject.status, 'PENDING_REVIEW');
    assert.equal((await other.c.get('/catalog')).data.subjects.length, 0); assert.equal((await owner.c.get('/catalog')).data.subjects.length, 1);
    assert.equal((await owner.c.post(`/topics/${d.topics[0].id}/ratings`, rate())).status, 403); assert.equal((await other.c.post(`/topics/${d.topics[0].id}/ratings`, rate())).status, 404);
    assert.equal((await other.c.post(`/subjects/${d.subject.id}/topics`, { name: 'Sneaky' })).status, 404); assert.equal((await owner.c.get('/admin/pending-subjects')).status, 403);
    const pending = (await admin.c.get('/admin/pending-subjects')).data; assert.equal(pending.length, 1); assert.equal((await admin.c.post(`/admin/subjects/${d.subject.id}/approve`)).status, 200);
    assert.equal((await other.c.get('/catalog')).data.subjects.length, 1); assert.equal((await other.c.post(`/topics/${d.topics[0].id}/ratings`, rate())).status, 201);
    assert.equal((await owner.c.get('/me/state')).data.notifications.some(n => /approved/.test(n.text)), true);
    const d2 = (await owner.c.post('/subjects', subjectBody({ name: 'Will Be Rejected' }))).data; assert.equal((await admin.c.post(`/admin/subjects/${d2.subject.id}/reject`)).status, 200); assert.equal(mod.db.prepare("SELECT count(*) c FROM subjects WHERE name = 'Will Be Rejected'").get().c, 0);
  } finally { await mod.close(); }
});
test('personal lists: my subjects and saved topics are per user, idempotent and reversible', async () => {
  const a = await signUp(app); const b = await signUp(app); const d = await publish(a.c, { name: 'Networks', topics: [{ name: 'TCP' }] });
  assert.equal((await b.c.put(`/me/subjects/${d.subject.id}`)).status, 200); assert.equal((await b.c.put(`/me/subjects/${d.subject.id}`)).status, 200); assert.equal((await b.c.get('/me/state')).data.user.savedSubjectIds.filter(x => x === d.subject.id).length, 1);
  assert.equal((await b.c.del(`/me/subjects/${d.subject.id}`)).status, 200); assert.equal((await b.c.get('/me/state')).data.user.savedSubjectIds.includes(d.subject.id), false); assert.equal(app.db.prepare('SELECT count(*) c FROM subjects WHERE id = ?').get(d.subject.id).c, 1); // catalog untouched
  assert.equal((await b.c.put('/me/subjects/nope')).status, 404);
  const tid = d.topics[0].id; assert.equal((await b.c.put(`/me/saved-topics/${tid}`)).status, 200); assert.equal((await b.c.put(`/me/saved-topics/${tid}`)).status, 200); assert.deepEqual((await b.c.get('/me/state')).data.saved, [tid]); assert.deepEqual((await a.c.get('/me/state')).data.saved, []);
  assert.equal((await b.c.del(`/me/saved-topics/${tid}`)).status, 200); assert.deepEqual((await b.c.get('/me/state')).data.saved, []); assert.equal((await b.c.put('/me/saved-topics/nope')).status, 404);
});
test('planner: validation, purposes, ownership, completion creates activity once, streak follows', async () => {
  const a = await signUp(app); const b = await signUp(app); const d = await publish(a.c, { name: 'Compilers', topics: [{ name: 'Parsing' }] }); const tid = d.topics[0].id;
  const day = new Date().toISOString().slice(0, 10);
  const p = await a.c.post('/me/plans', { topicId: tid, target: day, minutes: 45, purpose: 'EXAMS' }); assert.equal(p.status, 201); assert.deepEqual([p.data.status, p.data.purpose, p.data.minutes], ['Planned', 'EXAMS', 45]);
  for (const bad of [{ minutes: 4 }, { minutes: 601 }, { target: '2026-13-40' }, { target: 'tomorrow' }, { purpose: 'NOPE' }, { purpose: 'OTHER' }, { purpose: 'OTHER', customPurpose: '   ' }, { purpose: 'EXAMS', customPurpose: 'x' }, { status: 'Done' }, { topicId: 'missing' }])
    assert.ok([404, 422].includes((await a.c.post('/me/plans', { topicId: tid, target: day, minutes: 30, ...bad })).status), JSON.stringify(bad));
  const o = await a.c.post('/me/plans', { topicId: tid, target: day, minutes: 30, purpose: 'OTHER', customPurpose: '  Hackathon  prep ' }); assert.equal(o.data.customPurpose, 'Hackathon prep');
  assert.equal((await a.c.patch(`/me/plans/${o.data.id}`, { purpose: null })).data.purpose, undefined); // clearing the purpose also clears the custom text
  assert.equal((await b.c.patch(`/me/plans/${p.data.id}`, { minutes: 90 })).status, 404); assert.equal((await b.c.del(`/me/plans/${p.data.id}`)).status, 200); assert.equal((await a.c.get('/me/state')).data.plans.length, 2); // someone else's plan is untouchable
  assert.equal((await a.c.get('/me/state')).data.user.streak, 0);
  assert.equal((await a.c.patch(`/me/plans/${p.data.id}`, { status: 'In Progress' })).data.status, 'In Progress'); assert.equal((await a.c.get('/me/state')).data.user.streak, 0);
  assert.equal((await a.c.patch(`/me/plans/${p.data.id}`, { status: 'Completed' })).data.status, 'Completed'); assert.equal((await a.c.get('/me/state')).data.user.streak, 1);
  await a.c.patch(`/me/plans/${p.data.id}`, { status: 'Planned' }); await a.c.patch(`/me/plans/${p.data.id}`, { status: 'Completed' }); assert.equal(app.db.prepare("SELECT count(*) c FROM activity WHERE plan_id = ?").get(p.data.id).c, 1); // no double counting
  assert.equal((await a.c.patch(`/me/plans/${p.data.id}`, { topicId: 'x' })).status, 422); assert.equal((await a.c.del(`/me/plans/${p.data.id}`)).status, 200);
  assert.equal((await a.c.get('/me/state')).data.plans.length, 1); assert.equal((await b.c.get('/me/state')).data.user.streak, 0);
});
test('notes are private to their owner and validated', async () => {
  const a = await signUp(app); const b = await signUp(app); const d = await publish(a.c, { name: 'Security', topics: [{ name: 'Hashing' }] });
  const n = await a.c.post('/me/notes', { title: 'Reminder', body: 'SECRET-NOTE-BODY', subjectId: d.subject.id, topicId: d.topics[0].id }); assert.equal(n.status, 201);
  assert.equal((await b.c.patch(`/me/notes/${n.data.id}`, { title: 'Hijack' })).status, 404); await b.c.del(`/me/notes/${n.data.id}`);
  for (const path of ['/me/state', '/catalog', '/profile', '/me/notifications']) assert.doesNotMatch((await b.c.get(path)).text, /SECRET-NOTE-BODY/, path);
  assert.equal((await a.c.get('/me/state')).data.notes.length, 1);
  for (const bad of [{ title: '', body: 'x' }, { title: 'x', body: '' }, { title: 'x'.repeat(81), body: 'x' }, { title: 'x', body: 'y'.repeat(2001) }, { title: 'x', body: 'y', planId: 'not-mine' }, { title: 'x', body: 'y', subjectId: 'missing' }]) assert.ok([404, 422].includes((await a.c.post('/me/notes', bad)).status), JSON.stringify(bad));
  assert.equal((await a.c.patch(`/me/notes/${n.data.id}`, { title: 'Renamed' })).data.title, 'Renamed'); assert.equal((await a.c.del(`/me/notes/${n.data.id}`)).status, 200); assert.equal((await a.c.get('/me/state')).data.notes.length, 0);
});
test('subject drafts are private and round-trip', async () => {
  const a = await signUp(app); const b = await signUp(app); const draft = { name: 'Half done', branch: 'Mechanical', semester: 2, description: '', topics: [{ name: 'Gears', unit: '', description: '', hours: '' }] };
  assert.equal((await a.c.put('/me/drafts/d123', draft)).status, 200); await a.c.put('/me/drafts/d123', { ...draft, name: 'Renamed' }); const got = (await a.c.get('/me/state')).data.drafts; assert.equal(got.length, 1); assert.equal(got[0].name, 'Renamed'); assert.equal(got[0].id, 'd123');
  assert.equal((await b.c.get('/me/state')).data.drafts.length, 0); assert.equal((await a.c.put('/me/drafts/bad id!', draft)).status, 422); assert.equal((await a.c.del('/me/drafts/d123')).status, 200); assert.equal((await a.c.get('/me/state')).data.drafts.length, 0);
});
test('notifications can be read one by one or all at once, only by their owner; busy chats do not flood the bell', async () => {
  const s = await makeSenior(app); const j = await signUp(app); await j.c.post('/conversations', { seniorId: s.user.id, text: 'Hello senior' }); const convId = (await j.c.get('/me/conversations')).data[0].id;
  await j.c.post(`/conversations/${convId}/messages`, { text: 'Second while unread' }); const n = (await s.c.get('/me/notifications')).data; assert.equal(n.length, 1); assert.equal(n[0].read, false); // two messages, one unread notification
  assert.equal((await j.c.post(`/me/notifications/${n[0].id}/read`)).status, 200); assert.equal((await s.c.get('/me/notifications')).data[0].read, false); // another user cannot mark it read
  assert.equal((await s.c.post(`/me/notifications/${n[0].id}/read`)).status, 200); assert.equal((await s.c.get('/me/notifications')).data[0].read, true);
  await j.c.post(`/conversations/${convId}/messages`, { text: 'Third after reading' }); assert.equal((await s.c.get('/me/notifications')).data.length, 2); // a new message after reading gets a fresh notification
  assert.equal((await s.c.post('/me/notifications/read-all')).status, 200); assert.ok((await s.c.get('/me/notifications')).data.every(x => x.read));
});
