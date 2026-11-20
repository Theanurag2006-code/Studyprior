import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { Client, YEAR, makeAdmin, makeSenior, rate, signUp, start, subjectBody } from './helpers.mjs';

let app; before(async () => { app = await start(); }); after(() => app.close());

test('the helper directory includes opted-in semester-3+ students of every account category, never the viewer or private profiles', async () => {
  const open = await makeSenior(app, { name: 'Open Senior' });
  const juniorHelper = await signUp(app, { name: 'Junior Semester Six Helper', accountType: 'JUNIOR', currentSemester: 6, enrollmentYear: YEAR - 3, graduationYear: YEAR + 1 });
  assert.equal((await juniorHelper.c.patch('/profile', { available: true })).status, 200);
  const candidateHelper = await signUp(app, { name: 'Candidate Semester Three Helper', accountType: 'CANDIDATE', currentSemester: 3 });
  assert.equal((await candidateHelper.c.patch('/profile', { available: true })).status, 200);
  const closed = await signUp(app, { currentSemester: 7, enrollmentYear: YEAR - 3, graduationYear: YEAR + 1, name: 'Closed Senior', accountType: 'SENIOR' });
  const hidden = await makeSenior(app, { name: 'Hidden Senior' }); await hidden.c.patch('/profile', { publicProfile: false });
  const sem1Senior = await signUp(app, { name: 'Semester One Senior', accountType: 'SENIOR', currentSemester: 1, enrollmentYear: YEAR, graduationYear: YEAR + 4 });
  assert.equal((await sem1Senior.c.patch('/profile', { available: true })).status, 422);
  const viewer = await signUp(app, { name: 'Just Junior' });
  const list = (await viewer.c.get('/catalog')).data.seniors; const byName = Object.fromEntries(list.map(s => [s.name, s]));
  assert.ok(byName['Open Senior']); assert.ok(byName['Junior Semester Six Helper']); assert.equal(byName['Junior Semester Six Helper'].accountType, 'Junior');
  assert.ok(byName['Candidate Semester Three Helper']); assert.equal(byName['Candidate Semester Three Helper'].accountType, 'Candidate');
  assert.equal(byName['Closed Senior'], undefined); assert.equal(byName['Hidden Senior'], undefined); assert.equal(byName['Semester One Senior'], undefined); assert.equal(byName['Just Junior'], undefined);
  assert.doesNotMatch(JSON.stringify(list), /@example\.test/); assert.equal(byName['Open Senior'].year, 'Third Year');
  assert.equal((await open.c.get('/catalog')).data.seniors.some(s => s.id === open.user.id), false); void closed;
});
test('a student can start a conversation only with an opted-in semester-3+ helper; the first message is the starter', async () => {
  const s = await makeSenior(app); const closed = await signUp(app, { currentSemester: 7, enrollmentYear: YEAR - 3, graduationYear: YEAR + 1 }); const j = await signUp(app); const j2 = await signUp(app);
  assert.equal((await j.c.post('/conversations', { seniorId: closed.user.id, text: 'Hi' })).error.code, 'NOT_FOUND'); assert.equal((await j.c.post('/conversations', { seniorId: j2.user.id, text: 'Hi' })).status, 404); // juniors cannot be "asked"
  assert.equal((await j.c.post('/conversations', { seniorId: j.user.id, text: 'Hi' })).status, 404); assert.equal((await j.c.post('/conversations', { seniorId: 'nobody', text: 'Hi' })).status, 404);
  for (const bad of [{ text: '' }, { text: 'x'.repeat(1001) }, { text: 'ok', extra: 1 }]) assert.equal((await j.c.post('/conversations', { seniorId: s.user.id, ...bad })).status, 422);
  assert.equal((await new Client(app.base).post('/conversations', { seniorId: s.user.id, text: 'Hi' })).status, 401);
  const c1 = await j.c.post('/conversations', { seniorId: s.user.id, text: 'Hello, I need help with trees.' }); assert.equal(c1.status, 201); assert.equal(c1.data.peer.name, 'Sam Senior'); assert.equal(c1.data.messages.length, 1); assert.equal(c1.data.messages[0].from, 'me');
  const again = await j.c.post('/conversations', { seniorId: s.user.id, text: 'One more thing' }); assert.equal(again.data.id, c1.data.id); assert.equal(again.data.messages.length, 2); // same pair, same conversation
  const view = (await s.c.get('/me/conversations')).data; assert.equal(view.length, 1); assert.equal(view[0].messages[0].from, 'them'); assert.equal(view[0].unread, 2); assert.equal(view[0].seniorId, j.user.id); assert.equal(view[0].peer.level, 'Junior');
});
test('only the two people in a conversation can read or write in it; reading marks messages read', async () => {
  const s = await makeSenior(app); const j = await signUp(app); const nosy = await signUp(app); const conv = (await j.c.post('/conversations', { seniorId: s.user.id, text: 'Private question' })).data;
  assert.equal((await nosy.c.post(`/conversations/${conv.id}/messages`, { text: 'Hi' })).status, 404); assert.equal((await nosy.c.post(`/conversations/${conv.id}/read`)).status, 404); assert.doesNotMatch((await nosy.c.get('/me/conversations')).text, /Private question/);
  const reply = await s.c.post(`/conversations/${conv.id}/messages`, { text: 'Happy to help.' }); assert.equal(reply.status, 201); assert.equal((await j.c.get('/me/conversations')).data[0].unread, 1);
  assert.equal((await j.c.post(`/conversations/${conv.id}/read`)).status, 200); assert.equal((await j.c.get('/me/conversations')).data[0].unread, 0); assert.equal((await s.c.get('/me/conversations')).data[0].unread, 1);
  assert.equal((await j.c.post(`/conversations/${conv.id}/messages`, { text: '   ' })).status, 422);
});
test('Ask Everyone private mode creates separate one-to-one conversations for every opted-in helper', async () => {
  const isolated = await start();
  try {
    const asker = await signUp(isolated, { name: 'First Semester Asker', accountType: 'JUNIOR', currentSemester: 1, enrollmentYear: YEAR, graduationYear: YEAR + 4 });
    const junior = await signUp(isolated, { name: 'Junior Helper', accountType: 'JUNIOR', currentSemester: 3 }); await junior.c.patch('/profile', { available: true });
    const candidate = await signUp(isolated, { name: 'Candidate Helper', accountType: 'CANDIDATE', currentSemester: 5, enrollmentYear: YEAR - 2, graduationYear: YEAR + 2 }); await candidate.c.patch('/profile', { available: true });
    const closed = await signUp(isolated, { name: 'Not Available', accountType: 'SENIOR', currentSemester: 6, enrollmentYear: YEAR - 3, graduationYear: YEAR + 1 });
    const result = await asker.c.post('/ask-everyone', { text: 'Can someone explain graph traversal?', mode: 'PRIVATE' });
    assert.equal(result.status, 201); assert.equal(result.data.mode, 'PRIVATE'); assert.equal(result.data.deliveredTo, 2); assert.equal(result.data.conversationIds.length, 2);
    const own = (await asker.c.get('/me/conversations')).data; assert.equal(own.length, 2); assert.ok(own.every(c => c.messages.length === 1 && c.messages[0].text === 'Can someone explain graph traversal?'));
    assert.equal((await junior.c.get('/me/conversations')).data.length, 1); assert.equal((await candidate.c.get('/me/conversations')).data.length, 1);
    assert.equal((await closed.c.get('/me/conversations')).data.length, 0);
    assert.equal((await junior.c.get('/me/notifications')).data.length, 1); assert.equal((await candidate.c.get('/me/notifications')).data.length, 1);
    assert.equal((await junior.c.get('/me/conversations')).data[0].messages[0].text, 'Can someone explain graph traversal?');
    assert.equal((await candidate.c.get('/me/conversations')).data[0].messages[0].text, 'Can someone explain graph traversal?');
  } finally { await isolated.close(); }
});
test('Ask Everyone shared mode creates a group visible only to its asker and invited helpers', async () => {
  const isolated = await start();
  try {
    const asker = await signUp(isolated, { name: 'Group Asker', accountType: 'SENIOR', currentSemester: 2, enrollmentYear: YEAR, graduationYear: YEAR + 3 });
    const helperA = await signUp(isolated, { name: 'Junior Group Helper', accountType: 'JUNIOR', currentSemester: 3 }); await helperA.c.patch('/profile', { available: true });
    const helperB = await signUp(isolated, { name: 'Candidate Group Helper', accountType: 'CANDIDATE', currentSemester: 4, enrollmentYear: YEAR - 1, graduationYear: YEAR + 3 }); await helperB.c.patch('/profile', { available: true });
    const outsider = await signUp(isolated, { name: 'Outsider' });
    const result = await asker.c.post('/ask-everyone', { text: 'How should I prepare for DSA interviews?', mode: 'GROUP' });
    assert.equal(result.status, 201); assert.equal(result.data.mode, 'GROUP'); assert.equal(result.data.deliveredTo, 2); assert.ok(result.data.groupId);
    const path = `/ask-groups/${result.data.groupId}`;
    const askerView = (await asker.c.get(path)).data; assert.equal(askerView.memberType, 'ASKER'); assert.equal(askerView.members.length, 3); assert.equal(askerView.messages.length, 1);
    assert.equal(askerView.members.find(m => m.id === helperA.user.id).accountType, 'Junior');
    assert.equal(askerView.members.find(m => m.id === helperB.user.id).accountType, 'Candidate');
    assert.equal((await helperA.c.get(path)).data.memberType, 'HELPER'); assert.equal((await helperB.c.get(path)).data.members.length, 3);
    assert.equal((await outsider.c.get(path)).status, 404); assert.equal((await outsider.c.post(`${path}/messages`, { text: 'I should not see this' })).status, 404);
    const reply = await helperA.c.post(`${path}/messages`, { text: 'Start with arrays, hashing and trees.' }); assert.equal(reply.status, 201);
    assert.equal((await asker.c.get(path)).data.messages.length, 2); assert.equal((await helperB.c.get(path)).data.messages[1].text, 'Start with arrays, hashing and trees.');
    assert.equal((await asker.c.post(`${path}/read`)).status, 200); assert.equal((await outsider.c.post(`${path}/read`)).status, 404);
  } finally { await isolated.close(); }
});
test('direct messages move from Sent to Delivered to Seen as the recipient fetches and reads them', async () => {
  const helper = await makeSenior(app); const asker = await signUp(app);
  const created = await asker.c.post('/conversations', { seniorId: helper.user.id, text: 'Can you explain recursion?' });
  assert.equal(created.status, 201);
  assert.equal(created.data.messages[0].deliveryStatus, 'SENT');

  // A recipient polling their conversations acknowledges delivery, but not reading.
  await helper.c.get('/me/conversations');
  const delivered = (await asker.c.get('/me/conversations')).data[0];
  assert.equal(delivered.messages[0].deliveryStatus, 'DELIVERED');

  await helper.c.post(`/conversations/${created.data.id}/read`);
  const seen = (await asker.c.get('/me/conversations')).data[0];
  assert.equal(seen.messages[0].deliveryStatus, 'SEEN');
});

test('shared discussion receipts track partial delivery and per-helper Seen state', async () => {
  const isolated = await start();
  try {
    const asker = await signUp(isolated, { name: 'Receipt Asker', currentSemester: 1 });
    const helperA = await signUp(isolated, { name: 'Receipt Helper A', currentSemester: 3, accountType: 'JUNIOR' }); await helperA.c.patch('/profile', { available: true });
    const helperB = await signUp(isolated, { name: 'Receipt Helper B', currentSemester: 4, accountType: 'CANDIDATE' }); await helperB.c.patch('/profile', { available: true });
    const result = await asker.c.post('/ask-everyone', { text: 'Could someone explain pointers?', mode: 'GROUP' });
    assert.equal(result.status, 201);
    const path = `/ask-groups/${result.data.groupId}`;
    assert.equal((await asker.c.get(path)).data.messages[0].deliveryStatus, 'SENT');

    // Listing only group metadata must not acknowledge delivery of the message body.
    await helperA.c.get('/me/ask-groups');
    let message = (await asker.c.get(path)).data.messages[0];
    assert.equal(message.deliveryStatus, 'SENT');

    // Opening the discussion fetches its messages and acknowledges delivery.
    await helperA.c.get(path);
    message = (await asker.c.get(path)).data.messages[0];
    assert.equal(message.deliveryStatus, 'PARTIAL_DELIVERED');
    assert.equal(message.deliveredCount, 1); assert.equal(message.recipientCount, 2);

    await helperB.c.get(path);
    message = (await asker.c.get(path)).data.messages[0];
    assert.equal(message.deliveryStatus, 'DELIVERED');
    assert.equal(message.deliveredCount, 2);

    await helperA.c.post(`${path}/read`);
    message = (await asker.c.get(path)).data.messages[0];
    assert.equal(message.deliveryStatus, 'PARTIAL_SEEN');
    assert.equal(message.seenCount, 1);

    await helperB.c.post(`${path}/read`);
    message = (await asker.c.get(path)).data.messages[0];
    assert.equal(message.deliveryStatus, 'SEEN');
    assert.equal(message.seenCount, 2);
  } finally { await isolated.close(); }
});

test('blocking stops messages in both directions and can be undone', async () => {
  const s = await makeSenior(app); const j = await signUp(app); const conv = (await j.c.post('/conversations', { seniorId: s.user.id, text: 'Hello' })).data;
  assert.equal((await s.c.post('/blocks', { userId: j.user.id })).status, 201); assert.equal((await j.c.post(`/conversations/${conv.id}/messages`, { text: 'Still there?' })).status, 403); assert.equal((await s.c.post(`/conversations/${conv.id}/messages`, { text: 'Reply' })).status, 403);
  assert.equal((await j.c.post('/conversations', { seniorId: s.user.id, text: 'New try' })).status, 403); assert.equal((await s.c.get('/me/conversations')).data[0].blocked, true); assert.equal((await s.c.get('/blocks')).data[0].id, j.user.id);
  assert.equal((await s.c.del(`/blocks/${j.user.id}`)).status, 200); assert.equal((await j.c.post(`/conversations/${conv.id}/messages`, { text: 'Back again' })).status, 201); assert.equal((await s.c.post('/blocks', { userId: s.user.id })).status, 404);
});
test('message sending is rate limited per hour', async () => {
  const s = await makeSenior(app); const j = await signUp(app); const conv = (await j.c.post('/conversations', { seniorId: s.user.id, text: 'm0' })).data; let last;
  for (let i = 1; i <= 41; i++) last = await j.c.post(`/conversations/${conv.id}/messages`, { text: `m${i}` }); assert.equal(last.status, 429); assert.equal(last.error.code, 'RATE_LIMITED'); assert.equal(app.db.prepare('SELECT count(*) c FROM messages WHERE conversation_id = ?').get(conv.id).c, 40);
});
test('reporting: only content you can see, once per item; admins review and resolve', async () => {
  const s = await makeSenior(app); const j = await signUp(app); const nosy = await signUp(app); const admin = await makeAdmin(app, 'mod@example.test');
  const conv = (await j.c.post('/conversations', { seniorId: s.user.id, text: 'Rude message text' })).data; const mid = (await s.c.get('/me/conversations')).data[0].messages[0].id;
  assert.equal((await nosy.c.post('/reports', { kind: 'message', targetId: mid, reason: 'Spam' })).status, 404); assert.equal((await s.c.post('/reports', { kind: 'message', targetId: mid, reason: 'Inappropriate' })).status, 201);
  assert.equal((await s.c.post('/reports', { kind: 'message', targetId: mid, reason: 'Inappropriate' })).error.code, 'ALREADY_REPORTED'); assert.equal((await s.c.post('/reports', { kind: 'message', targetId: mid, reason: 'x' })).status, 422);
  const d = (await s.c.post('/subjects', subjectBody({ name: 'Reportable', topics: [{ name: 'T1' }] }))).data; const rid = (await j.c.post(`/topics/${d.topics[0].id}/ratings`, rate({ advice: 'Questionable advice' }))).data.id;
  assert.equal((await s.c.post('/reports', { kind: 'rating', targetId: rid, reason: 'Misleading' })).status, 201); assert.equal((await s.c.post('/reports', { kind: 'rating', targetId: 'missing', reason: 'Misleading' })).status, 404);
  assert.equal((await j.c.get('/admin/reports')).status, 403); const list = (await admin.c.get('/admin/reports')).data; assert.equal(list.length, 2); assert.ok(list.some(r => /Rude message text/.test(r.target))); assert.ok(list.every(r => r.status === 'Open'));
  assert.equal((await admin.c.post(`/admin/reports/${list[0].id}/resolve`)).status, 200); assert.equal((await admin.c.get('/admin/reports')).data.filter(r => r.status === 'Resolved').length, 1); assert.equal((await admin.c.post('/admin/reports/missing/resolve')).status, 404); void conv;
});
test('admin endpoints: metrics and users, closed to students', async () => {
  const admin = await makeAdmin(app, 'root@example.test'); const j = await signUp(app); await signUp(app, { name: 'Candidate metrics user', accountType: 'CANDIDATE', currentSemester: 1 }); const d = (await j.c.post('/subjects', subjectBody({ name: 'Metrics Subject', topics: [{ name: 'Hot Topic' }] }))).data;
  for (let i = 0; i < 3; i++) { const u = await signUp(app); await u.c.post(`/topics/${d.topics[0].id}/ratings`, rate()); }
  for (const p of ['/admin/metrics', '/admin/users', '/admin/reports', '/admin/pending-subjects']) { assert.equal((await j.c.get(p)).status, 403, p); assert.equal((await new Client(app.base).get(p)).status, 401, p); }
  const m = (await admin.c.get('/admin/metrics')).data; assert.ok(m.users >= 5); assert.ok(m.candidates >= 1); assert.equal(m.admins >= 1, true); assert.equal(m.topTopics[0].name, 'Hot Topic'); assert.equal(m.topTopics[0].ratings, 3);
  const users = (await admin.c.get('/admin/users')).data; assert.ok(users.some(u => u.role === 'ADMIN' && u.level === null)); assert.doesNotMatch(JSON.stringify(users), /pw_hash|scrypt/);
});
