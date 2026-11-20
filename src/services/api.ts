import * as d from '../data/mock';
import { squash } from '../lib/purposes';
import type { AppNotification, Contributor, Conversation, NewSubjectInput, NewTopicInput, Note, PlanItem, ProfilePatch, Rating, RatingInput, Report, Senior, Subject, SubjectDraft, Topic, Unit, User, ContributionType, SeniorFeedPage, SeniorProfileData, ApiTopicSummary, TopicRelationship, TopicRelationshipType, AskGroup, AskGroupDetail, AskGroupMessage } from '../types';

export interface Catalog { subjects: Subject[]; units: Unit[]; topics: Topic[]; relationships: TopicRelationship[]; ratings: Rating[]; seniors: Senior[]; contributors: Contributor[] }
export interface PublishResult { subject: Subject; units: Unit[]; topics: Topic[] }
export type ApiMode = 'api' | 'demo';
export class ApiError extends Error { constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; } }

/** Contract implemented by both adapters. See docs/api-contract.md for the HTTP shape. */
export interface StudyPriorApi {
  mode: ApiMode;
  getCatalog(): Promise<Catalog>;
  publishSubject(input: NewSubjectInput): Promise<PublishResult>;
  addTopic(input: NewTopicInput): Promise<{ topic: Topic; unit?: Unit }>;
  createTopicRelationship(sourceTopicId: string, targetTopicId: string, type: TopicRelationshipType): Promise<TopicRelationship>;
  deleteTopicRelationship(topicId: string, relationshipId: string): Promise<void>;
  submitRating(input: RatingInput): Promise<Rating>;
  /** Resolves only after the change is really saved (server, or this device in demo mode); rejects with an Error otherwise. */
  updateProfile(patch: ProfilePatch): Promise<Partial<User>>;
  getUser(): Promise<User>; getPlans(): Promise<PlanItem[]>; getNotifications(): Promise<AppNotification[]>; getConversations(): Promise<Conversation[]>; getReports(): Promise<Report[]>;
}
export interface LocalStore { get<T>(k: string, fallback: T): T; set(k: string, v: unknown): void }
const PREFIX = 'studyprior-demo:';
/** Device-local persistence used by demo mode, plans, notes and drafts. Not a server. */
export function createLocalStore(storage?: Pick<Storage, 'getItem' | 'setItem'>): LocalStore {
  const mem = new Map<string, string>();
  const ok = () => { try { return storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined); } catch { return undefined; } };
  return {
    get<T>(k: string, fallback: T): T { try { const raw = ok()?.getItem(PREFIX + k) ?? mem.get(k); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; } },
    set(k, v) { const raw = JSON.stringify(v); mem.set(k, raw); try { ok()?.setItem(PREFIX + k, raw); } catch { /* storage full or blocked */ } },
  };
}

const later = <T>(v: T): Promise<T> => new Promise(r => setTimeout(() => r(structuredClone(v)), 250));
const norm = (s: string) => squash(s).toLowerCase();
const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= 5;

export function createDemoApi(local: LocalStore, opts: { simulateFailure?: () => boolean } = {}): StudyPriorApi {
  const adds = () => local.get<{ subjects: Subject[]; units: Unit[]; topics: Topic[] }>('catalog', { subjects: [], units: [], topics: [] });
  const mine = () => local.get<Rating[]>('ratings', []);
  const fail = () => { if (opts.simulateFailure?.()) throw new ApiError(503, 'Simulated server failure (demo). Nothing was saved.'); };
  return {
    mode: 'demo',
    getCatalog: () => { const a = adds(); return later({ subjects: [...d.subjects, ...a.subjects], units: [...d.units, ...a.units], topics: [...d.topics, ...a.topics], relationships: local.get<TopicRelationship[]>('topic-relationships', []), ratings: [...d.ratings, ...mine()], seniors: d.seniors, contributors: d.contributors }); },
    async publishSubject(i) {
      fail(); await later(0); const a = adds();
      const name = squash(i.name);
      if (name.length < 3 || !i.topics.length) throw new ApiError(422, 'Subject needs a name and at least one topic.');
      if ([...d.subjects, ...a.subjects].some(s => norm(s.name) === norm(name) && s.branch === i.branch && s.semester === i.semester)) throw new ApiError(409, 'A subject with this name already exists for that branch and semester.');
      const stamp = Date.now().toString(36);
      const subject: Subject = { id: `cs-${stamp}`, name, code: 'COMM', branch: i.branch, semester: i.semester, description: i.description, status: 'PUBLISHED', ownerId: 'me', community: true };
      const units: Unit[] = []; const topics: Topic[] = [];
      i.topics.forEach((t, k) => {
        const un = squash(t.unit) || 'General'; let u = units.find(x => norm(x.name) === norm(un));
        if (!u) { u = { id: `cu-${stamp}-${units.length}`, subjectId: subject.id, name: un }; units.push(u); }
        topics.push({ id: `ct-${stamp}-${k}`, unitId: u.id, subjectId: subject.id, name: squash(t.name), description: t.description, hours: t.hours });
      });
      local.set('catalog', { subjects: [...a.subjects, subject], units: [...a.units, ...units], topics: [...a.topics, ...topics] });
      return { subject, units, topics };
    },
    async addTopic(i) {
      fail(); await later(0); const a = adds(); const name = squash(i.name);
      if (name.length < 2 || name.length > 80) throw new ApiError(422, 'Topic name must be 2 to 80 characters.');
      const subj = [...d.subjects, ...a.subjects].find(s => s.id === i.subjectId); if (!subj) throw new ApiError(404, 'That subject is not available.');
      if ([...d.topics, ...a.topics].some(t => t.subjectId === i.subjectId && norm(t.name) === norm(name))) throw new ApiError(409, 'This topic already exists in this subject.');
      const un = squash(i.unit) || 'General'; const existing = [...d.units, ...a.units].find(u => u.subjectId === i.subjectId && norm(u.name) === norm(un));
      const unit: Unit | undefined = existing ? undefined : { id: `cu-${Date.now().toString(36)}`, subjectId: i.subjectId, name: un };
      const topic: Topic = { id: `ct-${Date.now().toString(36)}`, unitId: (existing ?? unit)!.id, subjectId: i.subjectId, name, description: i.description, hours: i.hours };
      local.set('catalog', { subjects: a.subjects, units: unit ? [...a.units, unit] : a.units, topics: [...a.topics, topic] });
      return { topic, unit };
    },
    async createTopicRelationship(sourceTopicId, targetTopicId, type) {
      fail(); await later(0);
      const a = adds(); const allTopics = [...d.topics, ...a.topics];
      const source = allTopics.find(t => t.id === sourceTopicId); const target = allTopics.find(t => t.id === targetTopicId);
      if (!source || !target) throw new ApiError(404, 'One of those topics is not available.');
      if (source.subjectId !== target.subjectId) throw new ApiError(409, 'Relationships can only connect topics in the same subject.');
      if (source.id === target.id) throw new ApiError(409, 'A topic cannot be related to itself.');
      let fromId = source.id; let toId = target.id;
      if (type === 'RELATED' && fromId.localeCompare(toId) > 0) [fromId, toId] = [toId, fromId];
      const rows = local.get<TopicRelationship[]>('topic-relationships', []);
      if (rows.some(r => r.sourceTopicId === fromId && r.targetTopicId === toId && r.type === type)) throw new ApiError(409, 'That relationship already exists.');
      if (type === 'PREREQUISITE') {
        const seen = new Set<string>(); const stack = [target.id];
        while (stack.length) {
          const current = stack.pop()!;
          if (current === source.id) throw new ApiError(409, 'That prerequisite would create a loop. Choose a different direction.');
          if (seen.has(current)) continue; seen.add(current);
          rows.filter(r => r.type === 'PREREQUISITE' && r.sourceTopicId === current).forEach(r => stack.push(r.targetTopicId));
        }
      }
      const row: TopicRelationship = { id: `rel-${Date.now().toString(36)}`, subjectId: source.subjectId, sourceTopicId: fromId, targetTopicId: toId, type, createdAt: new Date().toISOString(), isMine: true };
      local.set('topic-relationships', [...rows, row]); return row;
    },
    async deleteTopicRelationship(topicId, relationshipId) {
      fail(); await later(0); const rows = local.get<TopicRelationship[]>('topic-relationships', []);
      const row = rows.find(r => r.id === relationshipId && (r.sourceTopicId === topicId || r.targetTopicId === topicId));
      if (!row) throw new ApiError(404, 'That relationship is not available.');
      if (!row.isMine) throw new ApiError(403, 'Only the person who added this relationship can remove it.');
      local.set('topic-relationships', rows.filter(r => r.id !== relationshipId));
    },
    async submitRating(i) {
      fail(); await later(0);
      if (![i.importance, i.difficulty, i.exam, i.interview].every(inRange)) throw new ApiError(422, 'Each rating must be a whole number from 1 to 5.');
      const a = adds();
      if (![...d.topics, ...a.topics].some(t => t.id === i.topicId)) throw new ApiError(404, 'That topic is not available for rating.');
      const prev = mine(); const ex = prev.find(r => r.topicId === i.topicId);
      const row: Rating = { id: ex?.id ?? `r-${Date.now().toString(36)}`, topicId: i.topicId, userId: 'me', importance: i.importance, difficulty: i.difficulty, exam: i.exam, interview: i.interview, advice: i.advice, mistakes: i.mistakes, at: new Date().toISOString().slice(0, 10), level: i.accountType ?? i.level ?? 'Junior', accountType: i.accountType ?? i.level ?? 'Junior' };
      local.set('ratings', ex ? prev.map(r => (r === ex ? row : r)) : [...prev, row]);
      return row;
    },
    async updateProfile(p) {
      fail(); await later(0); const er: string[] = [];
      if (p.name !== undefined && (squash(p.name).length < 2 || squash(p.name).length > 80)) er.push('Name must be 2 to 80 characters.');
      if (p.college !== undefined && !squash(p.college)) er.push('College cannot be empty.'); if (p.bio !== undefined && p.bio.length > 300) er.push('Bio must be 300 characters or fewer.');
      if (er.length) throw new ApiError(422, er.join(' '));
      const next = { ...local.get<ProfilePatch>('profile', {}), ...p, ...(p.name !== undefined ? { name: squash(p.name) } : {}) }; local.set('profile', next); return next;
    },
    getUser: () => later({ ...d.user, ...local.get<ProfilePatch>('profile', {}) }), getPlans: () => later(d.plans), getNotifications: () => later(d.notifications), getConversations: () => later(d.conversations), getReports: () => later(d.reports),
  };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type SessionUser = User & { id: string };
type AuthSession = { user: SessionUser; csrfToken: string };
/** Anti-CSRF token for the signed-in session. Kept in memory only (never in storage); the server hands it out at sign-in and via /auth/me. */
let csrfToken: string | undefined;
let csrfUserId: string | undefined;
/** Keep the token bound to the account that supplied it. A different Safari tab can replace the shared cookie. */
export const setCsrfToken = (t?: string, userId?: string) => {
  csrfToken = t;
  csrfUserId = userId;
};
/** One place that talks HTTP: cookies included, CSRF header added to writes, server errors turned into ApiError (never silent success). */
export function makeCall(baseUrl: string, fetchImpl: Fetch) {
  const root = baseUrl.replace(/\/$/, '');
  return async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const send = async (retryAfterRefresh: boolean): Promise<T> => {
      let res: Response;
      try {
        const headers = new Headers(init?.headers ?? {});
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
        if (csrfToken && init?.method && init.method.toUpperCase() !== 'GET') headers.set('X-CSRF-Token', csrfToken);
        res = await fetchImpl(`${root}${path}`, { ...init, credentials: 'include', headers });
      } catch { throw new ApiError(0, 'Could not reach the server. Check your connection and try again.'); }

      let body: { data?: T; error?: { message?: string } } = {};
      try { body = await res.json(); } catch { /* non-JSON body */ }
      const message = body.error?.message ?? `Request failed (${res.status}).`;

      // A stale tab may still hold Account A's token after another tab signs in as Account B.
      // Refresh once, but never retry a write under a different account's cookie.
      if (res.status === 403 && !retryAfterRefresh && /missing or invalid csrf token/i.test(message)) {
        let refreshed: Response;
        try { refreshed = await fetchImpl(`${root}/api/v1/auth/me`, { credentials: 'include', headers: { 'Content-Type': 'application/json' } }); }
        catch { throw new ApiError(403, 'Your security token expired. Refresh this page and try again.'); }
        let sessionBody: { data?: AuthSession; error?: { message?: string } } = {};
        try { sessionBody = await refreshed.json(); } catch { /* non-JSON response */ }
        if (!refreshed.ok || !sessionBody.data?.user?.id || !sessionBody.data.csrfToken) {
          if (refreshed.status === 401) setCsrfToken(undefined);
          throw new ApiError(403, 'Your security token could not be refreshed. Reload this page and sign in again.');
        }
        const currentUserId = sessionBody.data.user.id;
        if (csrfUserId && currentUserId !== csrfUserId) {
          csrfToken = undefined;
          throw new ApiError(409, 'Your signed-in account changed in another browser tab. Reload this page before saving so the correct account is shown.');
        }
        setCsrfToken(sessionBody.data.csrfToken, currentUserId);
        return send(true);
      }

      if (!res.ok) throw new ApiError(res.status, message);
      if (body.data === undefined) throw new ApiError(502, 'The server sent an unexpected response.');
      return body.data;
    };
    return send(false);
  };
}
const json = (b: unknown) => JSON.stringify(b);
const drop = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
/** Real HTTP adapter for the catalog, subject publishing, topics, ratings and the profile. */
export function createHttpApi(baseUrl: string, fetchImpl: Fetch, fallback: StudyPriorApi): StudyPriorApi {
  const call = makeCall(baseUrl, fetchImpl);
  const mark = (r: Rating & { isMine?: boolean }): Rating => ({ ...r, userId: r.isMine ? 'me' : r.userId });
  return {
    ...fallback, mode: 'api',
    async getCatalog() { const c = await call<Catalog>('/api/v1/catalog'); return { ...c, relationships: c.relationships ?? [], contributors: c.contributors ?? [], ratings: c.ratings.map(mark) }; },
    async updateProfile(p) { // PATCH /api/v1/profile: role, level, semester, email and password are never sent
      const r = await call<{ user: User & { branch: string } }>('/api/v1/profile', { method: 'PATCH', body: json(drop({ name: p.name, department: p.department, branch: p.branch, college: p.college, enrollmentYear: p.enrollmentYear, graduationYear: p.graduationYear, bio: p.bio, available: p.available, publicProfile: p.publicProfile, accountType: p.accountType?.toUpperCase() })) });
      const u = r.user; return { name: u.name, department: u.department, branch: u.branch ?? '', college: u.college, enrollmentYear: u.enrollmentYear, graduationYear: u.graduationYear, bio: u.bio, available: u.available, publicProfile: u.publicProfile, accountType: u.accountType, accountTypeSelected: u.accountTypeSelected };
    },
    publishSubject: i => call<PublishResult>('/api/v1/subjects', { method: 'POST', body: json(i) }),
    addTopic: ({ subjectId, ...body }) => call<{ topic: Topic; unit?: Unit }>(`/api/v1/subjects/${encodeURIComponent(subjectId)}/topics`, { method: 'POST', body: json(drop(body)) }),
    createTopicRelationship: (sourceTopicId, targetTopicId, type) => call<TopicRelationship>(`/api/v1/topics/${encodeURIComponent(sourceTopicId)}/relationships`, { method: 'POST', body: json({ targetTopicId, type }) }),
    deleteTopicRelationship: (topicId, relationshipId) => call<unknown>(`/api/v1/topics/${encodeURIComponent(topicId)}/relationships/${encodeURIComponent(relationshipId)}`, { method: 'DELETE', body: '{}' }).then(() => undefined),
    async submitRating({ topicId, level: _level, accountType: _accountType, ...body }) { return mark(await call<Rating & { isMine?: boolean }>(`/api/v1/topics/${encodeURIComponent(topicId)}/ratings`, { method: 'POST', body: json(body) })); },
  };
}

export interface AppState { user: User; saved: string[]; plans: PlanItem[]; notes: Note[]; drafts: SubjectDraft[]; notifications: AppNotification[]; conversations: Conversation[] }
export interface SignUpInput { name: string; email: string; password: string; department: string; branch?: string; college: string; enrollmentNumber?: string; enrollmentYear: number; graduationYear: number; currentSemester: number; accountType: 'JUNIOR' | 'SENIOR' | 'CANDIDATE' }
export interface AdminUser { id: string; name: string; email: string; role: string; accountType: string | null; level?: string | null; semester: number | null; createdAt: string }
export interface PendingSubject { id: string; name: string; branch: string; semester: number; owner: string; topics: number }
export interface Metrics { users: number; juniors: number; seniors: number; candidates: number; admins: number; subjects: number; topics: number; ratings: number; pendingSubjects: number; openReports: number; topTopics: { id: string; name: string; score: number; label: string; ratings: number }[] }
/** Everything the signed-in app needs besides the catalog. Only exists when a server URL is configured. */
export interface ServerApi {
  me(): Promise<User | null>; login(email: string, password: string): Promise<User>; register(b: SignUpInput): Promise<User>; logout(): Promise<void>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>; forgotPassword(email: string): Promise<void>; resetPassword(token: string, password: string): Promise<void>;
  getState(): Promise<AppState>; setSavedTopic(id: string, on: boolean): Promise<void>; setMySubject(id: string, on: boolean): Promise<void>;
  createPlan(p: Omit<PlanItem, 'id'>): Promise<PlanItem>; updatePlan(id: string, p: Partial<PlanItem>): Promise<PlanItem>; deletePlan(id: string): Promise<void>;
  saveNote(n: Partial<Note> & Pick<Note, 'title' | 'body'>): Promise<Note>; deleteNote(id: string): Promise<void>; saveDraft(d: SubjectDraft): Promise<SubjectDraft>; deleteDraft(id: string): Promise<void>;
  getNotifications(): Promise<AppNotification[]>; markNotification(id: string): Promise<void>; markAllNotifications(): Promise<void>;
  getConversations(): Promise<Conversation[]>; startConversation(seniorId: string, text: string): Promise<Conversation>; sendMessage(id: string, text: string): Promise<void>; markConversationRead(id: string): Promise<void>;
  blockUser(userId: string): Promise<void>; reportMessage(messageId: string, reason: string): Promise<void>; saveTheme(theme: 'light' | 'dark'): Promise<void>;
  adminMetrics(): Promise<Metrics>; adminUsers(): Promise<AdminUser[]>; adminReports(): Promise<Report[]>; adminResolveReport(id: string): Promise<void>; adminPending(): Promise<PendingSubject[]>; adminApprove(id: string): Promise<void>; adminReject(id: string): Promise<void>;
  getTopicSummary(id: string): Promise<ApiTopicSummary>; getTopicSummaries(): Promise<Record<string, ApiTopicSummary>>; getSeniorProfile(id: string): Promise<SeniorProfileData>; getSeniorFeed(id: string, offset?: number, limit?: number): Promise<SeniorFeedPage>; setContributionHelpful(type: ContributionType, id: string, on: boolean): Promise<{ helpful: boolean; helpfulCount: number; isHelpful: boolean }>;
  askEveryone(input: { text: string; mode: 'PRIVATE' | 'GROUP' }): Promise<{ mode: 'PRIVATE' | 'GROUP'; deliveredTo: number; conversationIds?: string[]; groupId?: string }>; getAskGroups(): Promise<AskGroup[]>; getAskGroup(id: string): Promise<AskGroupDetail>; sendAskGroupMessage(id: string, text: string): Promise<AskGroupMessage>; markAskGroupRead(id: string): Promise<void>;
}
export function createServerApi(baseUrl: string, fetchImpl: Fetch): ServerApi {
  const call = makeCall(baseUrl, fetchImpl); const P = '/api/v1'; const post = (p: string, b: unknown = {}) => call<unknown>(`${P}${p}`, { method: 'POST', body: json(b) }).then(() => undefined);
  const session = (d: AuthSession) => { setCsrfToken(d.csrfToken, d.user.id); return d.user; };
  const planBody = (p: Partial<PlanItem>) => ({ ...('topicId' in p ? { topicId: p.topicId } : {}), ...('target' in p ? { target: p.target } : {}), ...('minutes' in p ? { minutes: p.minutes } : {}), ...('status' in p ? { status: p.status } : {}), ...('purpose' in p ? { purpose: p.purpose ?? null } : {}), ...('customPurpose' in p ? { customPurpose: p.customPurpose ?? null } : {}) });
  return {
    async me() { try { return session(await call<AuthSession>(`${P}/auth/me`)); } catch (e) { if (e instanceof ApiError && e.status === 401) { setCsrfToken(undefined); return null; } throw e; } },
    async login(email, password) { return session(await call<AuthSession>(`${P}/auth/login`, { method: 'POST', body: json({ email, password }) })); },
    async register(b) { return session(await call<AuthSession>(`${P}/auth/register`, { method: 'POST', body: json(drop(b)) })); },
    async logout() { try { await post('/auth/logout'); } finally { setCsrfToken(undefined); } },
    changePassword: (currentPassword, newPassword) => post('/auth/change-password', { currentPassword, newPassword }),
    forgotPassword: email => post('/auth/forgot-password', { email }), resetPassword: (token, password) => post('/auth/reset-password', { token, password }),
    getState: () => call<AppState>(`${P}/me/state`),
    setSavedTopic: (id, on) => call<unknown>(`${P}/me/saved-topics/${encodeURIComponent(id)}`, { method: on ? 'PUT' : 'DELETE', body: '{}' }).then(() => undefined),
    setMySubject: (id, on) => call<unknown>(`${P}/me/subjects/${encodeURIComponent(id)}`, { method: on ? 'PUT' : 'DELETE', body: '{}' }).then(() => undefined),
    createPlan: p => call<PlanItem>(`${P}/me/plans`, { method: 'POST', body: json(planBody(p)) }),
    updatePlan: (id, p) => call<PlanItem>(`${P}/me/plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: json(planBody(p)) }),
    deletePlan: id => call<unknown>(`${P}/me/plans/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' }).then(() => undefined),
    saveNote: n => { const body = { title: n.title, body: n.body, ...('subjectId' in n ? { subjectId: n.subjectId ?? null } : {}), ...('topicId' in n ? { topicId: n.topicId ?? null } : {}), ...('planId' in n ? { planId: n.planId ?? null } : {}) };
      return n.id ? call<Note>(`${P}/me/notes/${encodeURIComponent(n.id)}`, { method: 'PATCH', body: json(body) }) : call<Note>(`${P}/me/notes`, { method: 'POST', body: json(body) }); },
    deleteNote: id => call<unknown>(`${P}/me/notes/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' }).then(() => undefined),
    saveDraft: d => call<SubjectDraft>(`${P}/me/drafts/${encodeURIComponent(d.id)}`, { method: 'PUT', body: json({ name: d.name, branch: d.branch, semester: d.semester, description: d.description, topics: d.topics }) }),
    deleteDraft: id => call<unknown>(`${P}/me/drafts/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' }).then(() => undefined),
    getNotifications: () => call<AppNotification[]>(`${P}/me/notifications`), markNotification: id => post(`/me/notifications/${encodeURIComponent(id)}/read`), markAllNotifications: () => post('/me/notifications/read-all'),
    getConversations: () => call<Conversation[]>(`${P}/me/conversations`), startConversation: (seniorId, text) => call<Conversation>(`${P}/conversations`, { method: 'POST', body: json({ seniorId, text }) }),
    sendMessage: (id, text) => post(`/conversations/${encodeURIComponent(id)}/messages`, { text }), markConversationRead: id => post(`/conversations/${encodeURIComponent(id)}/read`),
    blockUser: userId => post('/blocks', { userId }), reportMessage: (messageId, reason) => post('/reports', { kind: 'message', targetId: messageId, reason }), saveTheme: theme => call<unknown>(`${P}/profile`, { method: 'PATCH', body: json({ theme }) }).then(() => undefined),
    adminMetrics: () => call<Metrics>(`${P}/admin/metrics`), adminUsers: () => call<AdminUser[]>(`${P}/admin/users`), adminReports: () => call<Report[]>(`${P}/admin/reports`), adminResolveReport: id => post(`/admin/reports/${encodeURIComponent(id)}/resolve`),
    adminPending: () => call<PendingSubject[]>(`${P}/admin/pending-subjects`), adminApprove: id => post(`/admin/subjects/${encodeURIComponent(id)}/approve`), adminReject: id => post(`/admin/subjects/${encodeURIComponent(id)}/reject`),
    getTopicSummary: id => call<ApiTopicSummary>(`${P}/topics/${encodeURIComponent(id)}/summary`),
    getTopicSummaries: () => call<Record<string, ApiTopicSummary>>(`${P}/topics/summaries`),
    getSeniorProfile: id => call<SeniorProfileData>(`${P}/seniors/${encodeURIComponent(id)}`),
    getSeniorFeed: (id, offset = 0, limit = 20) => call<SeniorFeedPage>(`${P}/seniors/${encodeURIComponent(id)}/feed?offset=${offset}&limit=${limit}`),
    setContributionHelpful: (type, id, on) => call<{ helpful: boolean; helpfulCount: number; isHelpful: boolean }>(`${P}/contributions/${type}/${encodeURIComponent(id)}/helpful`, { method: on ? 'PUT' : 'DELETE', body: '{}' }),
    askEveryone: input => call<{ mode: 'PRIVATE' | 'GROUP'; deliveredTo: number; conversationIds?: string[]; groupId?: string }>(`${P}/ask-everyone`, { method: 'POST', body: json(input) }),
    getAskGroups: () => call<AskGroup[]>(`${P}/me/ask-groups`),
    getAskGroup: id => call<AskGroupDetail>(`${P}/ask-groups/${encodeURIComponent(id)}`),
    sendAskGroupMessage: (id, text) => call<AskGroupMessage>(`${P}/ask-groups/${encodeURIComponent(id)}/messages`, { method: 'POST', body: json({ text }) }),
    markAskGroupRead: id => post(`/ask-groups/${encodeURIComponent(id)}/read`),
  };
}
