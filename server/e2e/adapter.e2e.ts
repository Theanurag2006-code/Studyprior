/**
 * END-TO-END CHECK: the frontend's real API code (src/services/api.ts) talking to the real server over HTTP.
 * Run from the server folder:   npm run e2e      (needs the dev tool "tsx": npx will fetch it)
 * It starts the server on a random port with an in-memory database, so it never touches your real data.
 */
import assert from 'node:assert/strict';
import { build } from '../src/server.mjs';
import { hashPassword } from '../src/lib/crypto.mjs';
import { createHttpApi, createDemoApi, createLocalStore, createServerApi, setCsrfToken, ApiError } from '../../src/services/api.ts';

const YEAR = new Date().getUTCFullYear();
const app = build({ dbPath: ':memory:', nodeEnv: 'test', printResetLinks: false });
await new Promise<void>(r => app.server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
/** A browser-like fetch that remembers cookies (Node's fetch does not). */
const browser = () => { const jar: Record<string, string> = {}; return async (url: string, init?: RequestInit) => { const h = new Headers(init?.headers); const c = Object.entries(jar).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '); if (c) h.set('Cookie', c);
  const res = await fetch(url, { ...init, headers: h }); for (const sc of res.headers.getSetCookie()) { const [pair, ...at] = sc.split(';'); const i = pair.indexOf('='); if (at.some(a => /max-age=0/i.test(a))) delete jar[pair.slice(0, i)]; else jar[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1)); } return res; }; };
const mkDemo = () => { const m = new Map<string, string>(); return createDemoApi(createLocalStore({ getItem: k => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) })); };
const signup = (n: string, sem = 3) => ({ name: n, email: `${n.toLowerCase().replace(/\W/g, '')}@example.test`, password: 'correct-horse-battery', department: 'Engineering & Technology', branch: 'Computer Science', college: 'Test University', enrollmentYear: YEAR - Math.ceil(sem / 2) + 1, graduationYear: YEAR + 3, currentSemester: sem });
/** The frontend keeps ONE csrf token per browser. This script plays several people, so it re-selects a person's token (me() refreshes it) before acting as them. */
const as = async (u: { me(): Promise<unknown> }) => { await u.me(); };
let passed = 0; const ok = (name: string) => { passed++; console.log(`  ok   ${name}`); };

// ---------- user A: a junior, with its own "browser"
const fa = browser(); const A = createServerApi(base + '', fa); const apiA = createHttpApi(base, fa, mkDemo());
assert.equal(await A.me(), null); ok('me() is null before signing in (401 handled, not an error)');
const a = await A.register(signup('Junior Joe')); assert.equal(a.level, 'Junior'); assert.equal(a.role, 'STUDENT'); ok('register returns the user (level derived by the server) and stores the CSRF token');
await assert.rejects(A.register(signup('Junior Joe')), (e: ApiError) => e.status === 409); ok('duplicate registration is an ApiError(409), not a silent success');

// ---------- publish a subject, add a topic, rate it through the frontend adapter
const pub = await apiA.publishSubject({ name: 'Operating Systems', branch: 'Computer Science', semester: 3, description: 'Core OS.', topics: [{ name: 'CPU Scheduling', unit: 'Processes', description: '', hours: 2 }, { name: 'Deadlocks', unit: 'Processes', description: '' }] });
assert.equal(pub.subject.status, 'PUBLISHED'); assert.equal(pub.subject.ownerId, 'me'); assert.equal(pub.topics.length, 2); ok('publishSubject creates the subject, units and topics');
await assert.rejects(apiA.publishSubject({ name: 'Operating  systems', branch: 'Computer Science', semester: 3, description: '', topics: [{ name: 'X1', unit: '', description: '' }] }), (e: ApiError) => e.status === 409); ok('duplicate subject is refused');
const added = await apiA.addTopic({ subjectId: pub.subject.id, name: 'Memory Management', unit: 'Storage', description: '', hours: 3 }); assert.equal(added.unit?.name, 'Storage'); ok('addTopic adds a topic and a new unit');
const tid = pub.topics[0].id; const r1 = await apiA.submitRating({ topicId: tid, importance: 5, difficulty: 3, exam: 4, interview: 5, advice: 'Practice previous questions.', mistakes: '' }); assert.equal(r1.userId, 'me'); assert.equal(r1.level, 'Junior');
const r2 = await apiA.submitRating({ topicId: tid, importance: 2, difficulty: 3, exam: 4, interview: 5, advice: 'Changed my mind.', mistakes: '' }); assert.equal(r2.id, r1.id); ok('submitRating creates then updates the SAME rating (one per topic), marked as mine');
await assert.rejects(apiA.submitRating({ topicId: tid, importance: 9, difficulty: 3, exam: 4, interview: 5, advice: '', mistakes: '' }), (e: ApiError) => e.status === 422); ok('an invalid rating is an ApiError(422)');
const cat = await apiA.getCatalog(); assert.equal(cat.ratings.filter(r => r.userId === 'me').length, 1); assert.equal(cat.topics.length, 3); assert.ok(Array.isArray(cat.contributors)); ok('getCatalog returns subjects, units, topics, ratings (own marked "me") and contributors');
const prof = await apiA.updateProfile({ name: 'Joe Junior', bio: 'Hi', available: false }); assert.equal(prof.name, 'Joe Junior'); await assert.rejects(apiA.updateProfile({ bio: 'x'.repeat(400) }), (e: ApiError) => e.status === 422); ok('updateProfile saves via PATCH /profile and validation errors surface');

// ---------- personal data through the Store-facing server API
await A.setSavedTopic(tid, true); await A.setMySubject(pub.subject.id, true); let st = await A.getState(); assert.deepEqual(st.saved, [tid]); assert.ok(st.user.savedSubjectIds.includes(pub.subject.id)); await A.setSavedTopic(tid, false); assert.deepEqual((await A.getState()).saved, []); ok('saved topics and my subjects round-trip');
const day = new Date().toISOString().slice(0, 10);
const plan = await A.createPlan({ topicId: tid, target: day, minutes: 45, status: 'Planned', purpose: 'OTHER', customPurpose: 'Hackathon' }); assert.equal(plan.customPurpose, 'Hackathon');
const cleared = await A.updatePlan(plan.id, { purpose: undefined, customPurpose: undefined }); assert.equal(cleared.purpose, undefined); assert.equal(cleared.customPurpose, undefined); ok('planner create + clearing the purpose (undefined becomes null on the wire)');
assert.equal((await A.me())!.streak, 0); const done = await A.updatePlan(plan.id, { status: 'Completed' }); assert.equal(done.status, 'Completed'); assert.equal((await A.me())!.streak, 1); ok('completing a plan raises the study streak to 1');
const n1 = await A.saveNote({ title: 'Idea', body: 'Revise round robin', subjectId: pub.subject.id, topicId: tid }); const n2 = await A.saveNote({ id: n1.id, title: 'Idea v2', body: 'Revise round robin', topicId: undefined }); assert.equal(n2.title, 'Idea v2'); assert.equal(n2.topicId, undefined); ok('notes: create, edit, and clearing the linked topic');
const d = await A.saveDraft({ id: 'd1', name: 'Half done', branch: 'Mechanical', semester: 2, description: '', topics: [{ name: 'Gears', unit: '', description: '', hours: '' }], updatedAt: '' }); assert.equal(d.name, 'Half done'); await A.deleteDraft('d1'); assert.equal((await A.getState()).drafts.length, 0); ok('drafts save and delete');
await A.deleteNote(n1.id); await A.deletePlan(plan.id); st = await A.getState(); assert.equal(st.notes.length + st.plans.length, 0); ok('notes and plans delete');
await A.changePassword('correct-horse-battery', 'a-brand-new-passphrase'); ok('change password works');

// ---------- user B: a senior, talks to A
const fb = browser(); const B = createServerApi(base, fb); const apiB = createHttpApi(base, fb, mkDemo()); const b = await B.register(signup('Sam Senior', 6)); assert.equal(b.level, 'Senior');
await as(A); await assert.rejects(A.startConversation(b.id, 'Hello'), (e: ApiError) => e.status === 409); ok('cannot message a senior who is not available yet (409)');
await as(B); await apiB.updateProfile({ available: true }); const catA = await apiA.getCatalog(); assert.ok(catA.seniors.some(s => s.id === b.id && s.available)); ok('an opted-in senior appears in the directory');
await as(A); const conv = await A.startConversation(b.id, 'Hi, can you explain scheduling?'); assert.equal(conv.messages.length, 1); assert.equal(conv.peer?.name, 'Sam Senior'); await A.sendMessage(conv.id, 'And deadlocks?'); ok('startConversation sends the starter; sendMessage adds to it');
await as(B); const seen = await B.getConversations(); assert.equal(seen[0].unread, 2); assert.equal(seen[0].messages[0].from, 'them'); assert.equal(seen[0].seniorId, a.id); const notes = await B.getNotifications(); assert.equal(notes.length, 1); assert.match(notes[0].text, /Joe Junior/); ok('the senior sees the messages as unread and gets one notification');
await B.markConversationRead(conv.id); assert.equal((await B.getConversations())[0].unread, 0); await B.markNotification(notes[0].id); assert.ok((await B.getNotifications())[0].read); ok('read receipts and notification read state');
await B.reportMessage(seen[0].messages[0].id, 'Testing the report flow'); await B.blockUser(a.id); await as(A); await assert.rejects(A.sendMessage(conv.id, 'still there?'), (e: ApiError) => e.status === 403); ok('report + block: the blocked user cannot send (403)');

// ---------- admin
app.db.prepare(`INSERT INTO users (pid, name, email, pw_hash, role, department, college) VALUES ('adm1', 'Admin', 'admin@example.test', ?, 'ADMIN', 'Administration', 'StudyPrior')`).run(await hashPassword('admin-passphrase-123'));
const fc = browser(); const C = createServerApi(base, fc); const admin = await C.login('admin@example.test', 'admin-passphrase-123'); assert.equal(admin.role, 'ADMIN'); assert.equal(admin.level, null);
const reports = await C.adminReports(); assert.equal(reports.length, 1); await C.adminResolveReport(reports[0].id); assert.equal((await C.adminReports())[0].status, 'Resolved'); assert.equal((await C.adminMetrics()).subjects, 1); assert.ok((await C.adminUsers()).length >= 3); ok('admin: reports, resolve, metrics and users');
await assert.rejects(A.adminUsers(), (e: ApiError) => e.status === 403); ok('students are refused admin data (403)');

// ---------- sign out
await as(A); await A.logout(); assert.equal(await A.me(), null); await assert.rejects(A.getState(), (e: ApiError) => e.status === 401); ok('logout ends the session (401 afterwards)');
setCsrfToken(undefined); await app.close(); console.log(`\n${passed} end-to-end checks passed`);
