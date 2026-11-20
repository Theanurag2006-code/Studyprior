import { describe, expect, it } from 'vitest';
import { ApiError, createDemoApi, createHttpApi, createLocalStore, makeCall, setCsrfToken } from './api';

const input = { name: 'Machine Learning', branch: 'Computer Science', semester: 6, description: '', topics: [{ name: 'Regression', unit: 'Basics', description: '' }] };
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };

describe('demo adapter', () => {
  it('publishes locally, then exposes topics for rating; one rating per topic', async () => {
    const api = createDemoApi(createLocalStore(mem())); const res = await api.publishSubject(input);
    expect((await api.getCatalog()).topics.some(t => t.id === res.topics[0].id)).toBe(true);
    const r = { topicId: res.topics[0].id, importance: 4, difficulty: 3, exam: 4, interview: 5, advice: '', mistakes: '' };
    await api.submitRating(r); await api.submitRating({ ...r, importance: 2 });
    expect((await api.getCatalog()).ratings.filter(x => x.topicId === r.topicId)).toHaveLength(1);
  });
  it('rejects duplicates and simulated failures without saving', async () => {
    const store = createLocalStore(mem()); const api = createDemoApi(store); await api.publishSubject(input);
    await expect(api.publishSubject(input)).rejects.toMatchObject({ status: 409 });
    const bad = createDemoApi(store, { simulateFailure: () => true }); await expect(bad.publishSubject({ ...input, name: 'Other Subject' })).rejects.toBeInstanceOf(ApiError);
    expect((await api.getCatalog()).subjects.filter(s => s.name === 'Other Subject')).toHaveLength(0);
  });
});
describe('http adapter', () => {
  const demo = createDemoApi(createLocalStore(mem()));
  const res = (status: number, body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status }));
  it('returns data on success and surfaces server errors', async () => {
    const ok = createHttpApi('http://x', () => res(201, { data: { subject: { id: 's' }, units: [], topics: [] } }), demo); expect((await ok.publishSubject(input)).subject.id).toBe('s');
    const bad = createHttpApi('http://x', () => res(500, { error: { message: 'boom' } }), demo); await expect(bad.publishSubject(input)).rejects.toMatchObject({ status: 500, message: 'boom' });
  });
  it('reports network failures instead of succeeding', async () => {
    const down = createHttpApi('http://x', () => Promise.reject(new TypeError('offline')), demo); await expect(down.submitRating({ topicId: 't', importance: 1, difficulty: 1, exam: 1, interview: 1, advice: '', mistakes: '' })).rejects.toMatchObject({ status: 0 });
  });
});

describe('profile saving', () => {
  const patch = { name: '  Anuj   Kumar ', bio: 'Hello', available: true };
  it('demo mode saves locally and getUser returns the saved values', async () => {
    const api = createDemoApi(createLocalStore(mem())); const saved = await api.updateProfile(patch);
    expect(saved.name).toBe('Anuj Kumar'); expect((await api.getUser()).bio).toBe('Hello'); expect((await api.getUser()).available).toBe(true);
  });
  it('rejects invalid values and simulated failures without saving anything', async () => {
    const store = createLocalStore(mem()); const api = createDemoApi(store);
    await expect(api.updateProfile({ name: 'A' })).rejects.toMatchObject({ status: 422 });
    const bad = createDemoApi(store, { simulateFailure: () => true }); await expect(bad.updateProfile({ bio: 'Never saved' })).rejects.toBeInstanceOf(ApiError);
    expect((await api.getUser()).bio).not.toBe('Never saved');
  });
  it('http mode sends PATCH /api/v1/profile with the CSRF header and maps the response; failures are errors', async () => {
    const seen: { url: string; method?: string; csrf?: string; body?: string }[] = [];
    const ok = createHttpApi('http://x', (url, init) => { const requestHeaders = new Headers(init?.headers); seen.push({ url, method: init?.method, csrf: requestHeaders.get('x-csrf-token') ?? undefined, body: String(init?.body) });
      return Promise.resolve(new Response(JSON.stringify({ data: { user: { name: 'Anuj', department: 'D', branch: null, college: 'C', enrollmentYear: 2024, graduationYear: 2028, bio: 'b', available: true } } }), { status: 200 })); }, createDemoApi(createLocalStore(mem())));
    setCsrfToken('tok123', 'profile-test-user');
    const r = await ok.updateProfile({ name: 'Anuj', available: true }); expect(r.available).toBe(true); expect(seen[0]).toMatchObject({ url: 'http://x/api/v1/profile', method: 'PATCH', csrf: 'tok123' });
    expect(JSON.parse(seen[0].body!)).toEqual({ name: 'Anuj', available: true }); // role/level/semester are never sent
    setCsrfToken(undefined); const denied = createHttpApi('http://x', () => Promise.resolve(new Response(JSON.stringify({ error: { message: 'Sign in required.' } }), { status: 401 })), createDemoApi(createLocalStore(mem())));
    await expect(denied.updateProfile({ name: 'Nope' })).rejects.toMatchObject({ status: 401, message: 'Sign in required.' });
  });
});


describe('CSRF session synchronization', () => {
  it('does not retry a write when another tab has switched the shared browser cookie to a different account', async () => {
    setCsrfToken('account-a-token', 'account-A');
    const seen: { path: string; method: string; token?: string }[] = [];
    const call = makeCall('http://studyprior.test', async (url, init) => {
      const path = String(url).replace('http://studyprior.test', '');
      const headers = new Headers(init?.headers);
      seen.push({ path, method: init?.method ?? 'GET', token: headers.get('X-CSRF-Token') ?? undefined });
      if (path === '/api/v1/auth/me') return new Response(JSON.stringify({ data: { user: { id: 'account-B' }, csrfToken: 'account-b-token' } }), { status: 200 });
      return new Response(JSON.stringify({ error: { message: 'Missing or invalid CSRF token.' } }), { status: 403 });
    });

    await expect(call('/api/v1/profile', { method: 'PATCH', body: '{}' })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/account changed in another browser tab/i) });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ path: '/api/v1/profile', method: 'PATCH', token: 'account-a-token' });
    expect(seen[1]).toMatchObject({ path: '/api/v1/auth/me', method: 'GET' });
    setCsrfToken(undefined);
  });

  it('refreshes an expired token and retries once when the same account is still signed in', async () => {
    setCsrfToken('old-token', 'account-A');
    const seen: { path: string; method: string; token?: string }[] = [];
    const call = makeCall('http://studyprior.test', async (url, init) => {
      const path = String(url).replace('http://studyprior.test', '');
      const headers = new Headers(init?.headers);
      seen.push({ path, method: init?.method ?? 'GET', token: headers.get('X-CSRF-Token') ?? undefined });
      if (path === '/api/v1/auth/me') return new Response(JSON.stringify({ data: { user: { id: 'account-A' }, csrfToken: 'fresh-token' } }), { status: 200 });
      if (headers.get('X-CSRF-Token') === 'old-token') return new Response(JSON.stringify({ error: { message: 'Missing or invalid CSRF token.' } }), { status: 403 });
      return new Response(JSON.stringify({ data: { saved: true } }), { status: 200 });
    });

    await expect(call('/api/v1/profile', { method: 'PATCH', body: '{}' })).resolves.toEqual({ saved: true });
    expect(seen.map(x => [x.path, x.method])).toEqual([
      ['/api/v1/profile', 'PATCH'], ['/api/v1/auth/me', 'GET'], ['/api/v1/profile', 'PATCH'],
    ]);
    expect(seen[2].token).toBe('fresh-token');
    setCsrfToken(undefined);
  });
});

describe('topic relationships', () => {
  it('demo mode stores prerequisite and related links and removes only local links', async () => {
    const store = createLocalStore(mem()); const api = createDemoApi(store);
    const subject = await api.publishSubject({ ...input, topics: [
      { name: 'Linear Equations', unit: 'Basics', description: '' },
      { name: 'Matrices', unit: 'Linear Algebra', description: '' },
      { name: 'Determinants', unit: 'Linear Algebra', description: '' },
    ] });
    const [linear, matrices, determinants] = subject.topics;
    const prerequisite = await api.createTopicRelationship(linear.id, matrices.id, 'PREREQUISITE');
    await api.createTopicRelationship(matrices.id, determinants.id, 'RELATED');
    await api.createTopicRelationship(matrices.id, determinants.id, 'PREREQUISITE');
    expect((await api.getCatalog()).relationships).toHaveLength(3);
    await expect(api.createTopicRelationship(determinants.id, linear.id, 'PREREQUISITE')).rejects.toMatchObject({ status: 409 });
    await expect(api.createTopicRelationship(linear.id, linear.id, 'RELATED')).rejects.toMatchObject({ status: 409 });
    await api.deleteTopicRelationship(linear.id, prerequisite.id);
    expect((await api.getCatalog()).relationships).toHaveLength(2);
  });
  it('HTTP mode uses the authenticated topic relationship endpoints', async () => {
    const seen: { url: string; method?: string; body?: string }[] = [];
    setCsrfToken('graph-token');
    const http = createHttpApi('http://studyprior.test', (url, init) => {
      seen.push({ url, method: init?.method, body: String(init?.body ?? '') });
      return Promise.resolve(new Response(JSON.stringify({ data: { id: 'rel-1', subjectId: 'sub-1', sourceTopicId: 'topic-1', targetTopicId: 'topic-2', type: 'PREREQUISITE', createdAt: '2026-10-30T00:00:00.000Z', isMine: true } }), { status: 201 }));
    }, createDemoApi(createLocalStore(mem())));
    const row = await http.createTopicRelationship('topic-1', 'topic-2', 'PREREQUISITE');
    expect(row.id).toBe('rel-1');
    expect(seen[0]).toMatchObject({ url: 'http://studyprior.test/api/v1/topics/topic-1/relationships', method: 'POST' });
    expect(JSON.parse(seen[0].body!)).toEqual({ targetTopicId: 'topic-2', type: 'PREREQUISITE' });
    await http.deleteTopicRelationship('topic-1', 'rel-1');
    expect(seen[1]).toMatchObject({ url: 'http://studyprior.test/api/v1/topics/topic-1/relationships/rel-1', method: 'DELETE' });
    setCsrfToken(undefined);
  });
});
