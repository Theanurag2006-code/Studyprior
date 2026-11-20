import { build } from '../src/server.mjs';
import { hashPassword } from '../src/lib/crypto.mjs';

export const YEAR = new Date().getUTCFullYear();
export async function start(over = {}) {
  const app = build({ dbPath: ':memory:', nodeEnv: 'test', printResetLinks: false, ...over });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r)); app.base = `http://127.0.0.1:${app.server.address().port}/api/v1`; return app;
}
/** A tiny browser: keeps cookies and the CSRF token like the real frontend does. */
export class Client {
  constructor(base) { this.base = base; this.cookies = {}; this.csrf = undefined; }
  async req(method, path, body, { csrf = true, headers = {} } = {}) {
    const h = { ...headers }; if (body !== undefined) h['Content-Type'] = 'application/json';
    const c = Object.entries(this.cookies).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; '); if (c) h.Cookie = c; if (csrf && this.csrf && method !== 'GET') h['X-CSRF-Token'] = this.csrf;
    const res = await fetch(this.base + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
    for (const sc of res.headers.getSetCookie?.() ?? []) { const [pair, ...attrs] = sc.split(';'); const i = pair.indexOf('='); const name = pair.slice(0, i); const val = decodeURIComponent(pair.slice(i + 1)); if (attrs.some(a => /max-age=0/i.test(a))) delete this.cookies[name]; else this.cookies[name] = val; this.lastSetCookie = sc; }
    const text = await res.text(); let json; try { json = text ? JSON.parse(text) : undefined; } catch { json = undefined; }
    if (json?.data?.csrfToken) this.csrf = json.data.csrfToken;
    return { status: res.status, body: json, data: json?.data, error: json?.error, headers: res.headers, text };
  }
  get(p, o) { return this.req('GET', p, undefined, o); } post(p, b, o) { return this.req('POST', p, b ?? {}, o); } put(p, b, o) { return this.req('PUT', p, b ?? {}, o); } patch(p, b, o) { return this.req('PATCH', p, b, o); } del(p, o) { return this.req('DELETE', p, {}, o); }
}
let n = 0;
export const regBody = (over = {}) => ({ name: 'Test Student', email: `student${++n}@example.test`, password: 'correct-horse-battery', department: 'Engineering & Technology', branch: 'Computer Science', college: 'Test University', enrollmentYear: YEAR - 1, graduationYear: YEAR + 3, currentSemester: 3, accountType: 'JUNIOR', ...over });
export async function signUp(app, over = {}) { const c = new Client(app.base); const body = regBody(over); const res = await c.post('/auth/register', body); return { c, body, res, user: res.data?.user }; }
/** A senior (semester 6) who is open to questions. */
export async function makeSenior(app, over = {}) { const s = await signUp(app, { currentSemester: 6, enrollmentYear: YEAR - 3, graduationYear: YEAR + 1, accountType: 'SENIOR', name: 'Sam Senior', ...over }); await s.c.patch('/profile', { available: true }); return s; }
export async function makeAdmin(app, email = 'admin@example.test', password = 'admin-passphrase-123') {
  app.db.prepare(`INSERT INTO users (pid, name, email, pw_hash, role, department, college) VALUES (?,?,?,?, 'ADMIN', 'Administration', 'StudyPrior')`).run(`adm${n++}`, 'Admin', email, await hashPassword(password));
  const c = new Client(app.base); const r = await c.post('/auth/login', { email, password }); return { c, res: r };
}
export const subjectBody = (over = {}) => ({ name: 'Data Structures', branch: 'Computer Science', semester: 3, description: 'Core structures.', topics: [{ name: 'Binary Trees', unit: 'Trees', description: '', hours: 2 }, { name: 'Graph Traversal', unit: 'Trees' }, { name: 'Hash Tables', unit: '' }], ...over });
export const rate = (o = {}) => ({ importance: 5, difficulty: 3, exam: 4, interview: 5, advice: 'Practice previous questions.', mistakes: 'Skipping edge cases.', ...o });
