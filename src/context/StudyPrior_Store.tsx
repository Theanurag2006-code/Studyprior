import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, local, server, ApiError, type AdminUser, type ApiMode, type Metrics, type PendingSubject, type PublishResult, type SignUpInput } from '../services';
import { summarize } from '../lib/priority';
import { normalizeTheme, type Theme } from '../lib/theme';
import type { ApiRatingSummary, ApiTopicSummary, AppNotification, AskGroup, Contributor, Conversation, NewSubjectInput, NewTopicInput, ProfilePatch, Note, PlanItem, PlanStatus, Rating, RatingInput, Report, Senior, Subject, SubjectDraft, Summary, Topic, TopicRelationship, TopicRelationshipType, Unit, User } from '../types';

export type { Theme };
const THEME_KEY = 'studyprior-theme';
/** Saved choice is respected; new users get Light. The removed legacy 'System' value is converted once and re-saved. */
const readTheme = (): Theme => { try { const raw = localStorage.getItem(THEME_KEY); const t = normalizeTheme(raw, window.matchMedia('(prefers-color-scheme: dark)').matches); if (raw === 'system') localStorage.setItem(THEME_KEY, t); return t; } catch { return 'light'; } };
export const ME = 'me';
let seq = 100;
const uid = (p: string) => `${p}${Date.now().toString(36)}${++seq}`;
const isPublic = (s: Subject) => s.status !== 'PENDING_REVIEW';
const mapServerSummary = (x: ApiRatingSummary | undefined): Summary | null => x && x.sampleCount > 0 && x.means && x.priorityScore !== null && x.priorityLabel
  ? { n: x.sampleCount, importance: x.means.importance, difficulty: x.means.difficulty, exam: x.means.exam, interview: x.means.interview, score: x.priorityScore, level: x.priorityLabel, confidence: x.confidence.label as Summary['confidence'] } : null;

interface Store {
  loading: boolean; loadError: string | null; reload: () => void; mode: ApiMode;
  /** 'checking' while the app asks the server whether you are signed in. Demo mode is always 'signedIn'. */
  authStatus: 'checking' | 'signedOut' | 'signedIn'; isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>; signUp: (b: SignUpInput) => Promise<void>; signOut: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>; resetPassword: (token: string, password: string) => Promise<void>; changePassword: (current: string, next: string) => Promise<void>;
  adminUsers: AdminUser[]; pending: PendingSubject[]; metrics: Metrics | null; approveSubject: (id: string) => Promise<void>; rejectSubject: (id: string) => Promise<void>;
  block: (userId: string) => Promise<void>; reportMessage: (messageId: string, reason: string) => Promise<void>;
  /** Public catalog only: pending-review subjects never appear here. */
  subjects: Subject[]; units: Unit[]; topics: Topic[]; allSubjects: Subject[]; allTopics: Topic[]; allUnits: Unit[]; contributors: Record<string, Contributor>; seniors: Senior[]; ratings: Rating[];
  user: User;
  /** Saves through the API layer; rejects (and changes nothing) if saving fails. */
  saveProfile: (p: ProfilePatch) => Promise<void>;
  saved: string[]; toggleSave: (id: string) => Promise<void>;
  mySubjects: Subject[]; addSubjects: (ids: string[]) => Promise<{ added: number; already: number }>; removeSubject: (id: string) => Promise<void>;
  publishSubject: (i: NewSubjectInput) => Promise<PublishResult>;
  addTopic: (i: NewTopicInput) => Promise<Topic>;
  topicRelationships: TopicRelationship[];
  addTopicRelationship: (sourceTopicId: string, targetTopicId: string, type: TopicRelationshipType) => Promise<TopicRelationship>;
  removeTopicRelationship: (topicId: string, relationshipId: string) => Promise<void>;
  drafts: SubjectDraft[]; saveDraft: (d: SubjectDraft) => Promise<void>; deleteDraft: (id: string) => Promise<void>;
  plans: PlanItem[]; addPlan: (p: Omit<PlanItem, 'id'>) => Promise<PlanItem>; updatePlan: (id: string, p: Partial<PlanItem>) => Promise<void>; setPlanStatus: (id: string, s: PlanStatus) => Promise<void>; removePlan: (id: string) => Promise<void>;
  userNotes: Note[]; saveNote: (n: Partial<Note> & Pick<Note, 'title' | 'body'>) => Promise<void>; deleteNote: (id: string) => Promise<void>;
  notes: AppNotification[]; markRead: (id: string) => Promise<void>; markAllRead: () => Promise<void>;
  askGroups: AskGroup[];
  convos: Conversation[]; startConvo: (seniorId: string, draft: string) => Promise<string>; setDraft: (id: string, t: string) => void; send: (id: string) => Promise<string>; readConvo: (id: string) => void;
  /** Resolves only after the API confirms; rejects with an Error otherwise. */
  saveRating: (r: Omit<RatingInput, 'level'>) => Promise<Rating>;
  reports: Report[]; resolveReport: (id: string) => Promise<void>;
  summary: (topicId: string) => Summary | null;
  toast: string | null; notify: (m: string) => void; notifyUndo: (m: string, undo: () => Promise<void>) => void; canUndo: boolean; runUndo: () => Promise<void>;
  theme: Theme; setTheme: (t: Theme, origin?: { x: number; y: number }) => void;
}
const Ctx = createContext<Store | null>(null);
export const useStore = () => { const c = useContext(Ctx); if (!c) throw new Error('StoreProvider missing'); return c; };

const applyDom = (t: Theme) => { document.documentElement.dataset.theme = t; };
const EMPTY_USER: User = { name: '', email: '', joined: '', department: '', enrollmentYear: 0, graduationYear: 0, college: '', branch: '', enrollment: '', bio: '', semester: 1, available: false, streak: 0, savedSubjectIds: [] };

export function StoreProvider({ children }: { children: ReactNode }) {
  const srv = server; // local alias so TypeScript can narrow it inside callbacks
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState<string | null>(null); const [ready, setReady] = useState(false);
  const [authStatus, setAuthStatus] = useState<'checking' | 'signedOut' | 'signedIn'>(srv ? 'checking' : 'signedIn');
  const [cat, setCat] = useState<{ subjects: Subject[]; units: Unit[]; topics: Topic[]; relationships: TopicRelationship[]; seniors: Senior[] }>({ subjects: [], units: [], topics: [], relationships: [], seniors: [] });
  const [ratings, setRatings] = useState<Rating[]>([]); const [people, setPeople] = useState<Contributor[]>([]); const [apiSummaries, setApiSummaries] = useState<Record<string, ApiTopicSummary>>({});
  const [user, setUser] = useState<User>(EMPTY_USER);
  const [saved, setSaved] = useState<string[]>(srv ? [] : ['t3', 't5']);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [userNotes, setUserNotes] = useState<Note[]>([]);
  const [drafts, setDrafts] = useState<SubjectDraft[]>([]);
  const [notes, setNotes] = useState<AppNotification[]>([]);
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [askGroups, setAskGroups] = useState<AskGroup[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]); const [pending, setPending] = useState<PendingSubject[]>([]); const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [toast, setToast] = useState<string | null>(null); const [undoAction, setUndoAction] = useState<(() => Promise<void>) | null>(null);
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const mounted = useRef(false);
  const notify = useCallback((m: string) => { setToast(m); setUndoAction(null); }, []);
  const notifyUndo = useCallback((m: string, undo: () => Promise<void>) => { setToast(m); setUndoAction(() => undo); }, []);
  // Ordinary feedback clears automatically; Undo remains available for seven seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => { setToast(null); setUndoAction(null); }, undoAction ? 7000 : 4000);
    return () => window.clearTimeout(timer);
  }, [toast, undoAction]);

  /** Shows a failure honestly. An expired session sends you back to sign-in instead of pretending nothing happened. */
  const fail = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) { setAuthStatus('signedOut'); notify('Your session expired. Please sign in again.'); return; }
    notify(`Not saved: ${e instanceof Error ? e.message : 'something went wrong.'}`);
  }, [notify]);
  const runUndo = useCallback(async () => { const action = undoAction; if (!action) return; setUndoAction(null); setToast(null); try { await action(); } catch (e) { fail(e); } }, [undoAction, fail]);
  const act = (fn: () => Promise<void>) => { fn().catch(fail); };
  const mergeConvos = (prev: Conversation[], fresh: Conversation[]) => [...fresh.map(f => ({ ...f, draft: prev.find(p => p.id === f.id)?.draft ?? '' })), ...prev.filter(p => p.id.startsWith('new:') && !fresh.some(f => f.seniorId === p.seniorId))];

  const load = useCallback(async () => {
    setLoading(true); setLoadError(null);
    try {
      if (srv) {
        const [c, st, summaries, groups] = await Promise.all([api.getCatalog(), srv.getState(), srv.getTopicSummaries(), srv.getAskGroups()]);
        setCat({ subjects: c.subjects, units: c.units, topics: c.topics, relationships: c.relationships ?? [], seniors: c.seniors }); setRatings(c.ratings); setPeople(c.contributors); setApiSummaries(summaries);
        setUser(st.user); setSaved(st.saved); setPlans(st.plans); setUserNotes(st.notes); setDrafts(st.drafts); setNotes(st.notifications); setConvos(st.conversations); setAskGroups(groups);
        if (st.user.role === 'ADMIN') { const [rp, us, pe, me] = await Promise.all([srv.adminReports(), srv.adminUsers(), srv.adminPending(), srv.adminMetrics()]); setReports(rp); setAdminUsers(us); setPending(pe); setMetrics(me); } else { setReports([]); setAdminUsers([]); setPending([]); setMetrics(null); }
        if (st.user.theme && st.user.theme !== document.documentElement.dataset.theme) { setThemeState(st.user.theme); applyDom(st.user.theme); try { localStorage.setItem(THEME_KEY, st.user.theme); } catch { /* storage unavailable */ } } // the saved account preference wins after sign-in
      } else {
        const [c, u, p, n, cv, rp] = await Promise.all([api.getCatalog(), api.getUser(), api.getPlans(), api.getNotifications(), api.getConversations(), api.getReports()]);
        setCat({ subjects: c.subjects, units: c.units, topics: c.topics, relationships: c.relationships ?? [], seniors: c.seniors }); setRatings(c.ratings); setPeople(c.contributors); setApiSummaries({});
        setUser(u); setPlans(local.get<PlanItem[] | null>('plans', null) ?? p); setUserNotes(local.get<Note[]>('notes', [])); setDrafts(local.get<SubjectDraft[]>('drafts', [])); setNotes(n); setConvos(cv); setAskGroups([]); setReports(rp);
      }
      setReady(true);
    } catch (e) { if (e instanceof ApiError && e.status === 401) setAuthStatus('signedOut'); else setLoadError(e instanceof Error ? e.message : 'Could not load data.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { // first load: ask the srv who is signed in (or, in demo mode, just load the demo data)
    if (!srv) { void load(); return; }
    srv.me().then(u => { if (u) { setAuthStatus('signedIn'); void load(); } else { setAuthStatus('signedOut'); setLoading(false); } }).catch(e => { setLoadError(e instanceof Error ? e.message : 'Could not reach the srv.'); setAuthStatus('signedOut'); setLoading(false); });
  }, [load]);
  const resetState = () => { setApiSummaries({}); setUser(EMPTY_USER); setSaved([]); setPlans([]); setUserNotes([]); setDrafts([]); setNotes([]); setConvos([]); setAskGroups([]); setReports([]); setAdminUsers([]); setPending([]); setMetrics(null); setReady(false); };
  const signIn = async (email: string, password: string) => { await srv!.login(email, password); setAuthStatus('signedIn'); await load(); };
  const signUp = async (b: SignUpInput) => { await srv!.register(b); setAuthStatus('signedIn'); await load(); };
  const signOut = async () => { try { await srv?.logout(); } catch { /* the cookie is cleared by the srv; if it was unreachable we still leave */ } resetState(); setAuthStatus(srv ? 'signedOut' : 'signedIn'); };
  // Demo mode keeps plans, notes and drafts on this device. With a srv they are saved there instead.
  useEffect(() => { if (ready && !srv) local.set('plans', plans); }, [ready, plans]);
  useEffect(() => { if (ready && !srv) local.set('notes', userNotes); }, [ready, userNotes]);
  useEffect(() => { if (ready && !srv) local.set('drafts', drafts); }, [ready, drafts]);
  // Live-ish messaging: while signed in, check for new messages and notifications every 10 seconds (no websockets are claimed).
  useEffect(() => {
    if (!srv || authStatus !== 'signedIn' || !ready) return;
    const id = window.setInterval(async () => { if (document.hidden) return; try { const [cv, n, groups] = await Promise.all([srv.getConversations(), srv.getNotifications(), srv.getAskGroups()]); setConvos(prev => mergeConvos(prev, cv)); setNotes(n); setAskGroups(groups); } catch { /* try again next time */ } }, 10_000);
    return () => window.clearInterval(id);
  }, [authStatus, ready]);

  // Theme: setTheme applies the DOM change itself (inside a view transition when possible); this effect only handles first load.
  useEffect(() => { if (!mounted.current) { mounted.current = true; applyDom(theme); } }, [theme]);
  const setTheme = (t: Theme, origin?: { x: number; y: number }) => {
    const before = document.documentElement.dataset.theme; const after = t;
    setThemeState(t); try { localStorage.setItem(THEME_KEY, t); } catch { /* storage unavailable */ }
    if (srv && authStatus === 'signedIn') srv.saveTheme(t).catch(() => undefined); // the choice is also kept in this browser, so a failed save is harmless
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (before === after || reduce) { applyDom(t); return; }
    if (!doc.startViewTransition) { const el = document.documentElement; el.classList.add('theme-fade'); applyDom(t); window.setTimeout(() => el.classList.remove('theme-fade'), 350); return; }
    const x = origin?.x ?? window.innerWidth / 2, y = origin?.y ?? 0;
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    doc.startViewTransition(() => applyDom(t)).ready.then(() => document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => undefined);
  };

  const summary = useCallback((topicId: string) => srv ? mapServerSummary(apiSummaries[topicId]?.overall) : summarize(ratings.filter(r => r.topicId === topicId)), [ratings, apiSummaries]);
  const refreshStreak = async () => { const u = await srv?.me(); if (u) setUser(x => ({ ...x, streak: u.streak })); }; // completing a plan changes the study streak
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);

  const value: Store = useMemo(() => {
    const pub = cat.subjects.filter(isPublic); const pubIds = new Set(pub.map(s => s.id));
    return {
      subjects: pub, allSubjects: cat.subjects, allTopics: cat.topics, allUnits: cat.units, contributors: Object.fromEntries(people.map(p => [p.id, p])), units: cat.units.filter(u => pubIds.has(u.subjectId)), topics: cat.topics.filter(t => pubIds.has(t.subjectId)), seniors: cat.seniors, ratings,
      user, saveProfile: async p => { const saved = await api.updateProfile(p); setUser(u => ({ ...u, ...saved })); },
      loading, loadError, reload: load, mode: api.mode, authStatus, isAdmin: user.role === 'ADMIN', signIn, signUp, signOut,
      forgotPassword: async e => { await srv!.forgotPassword(e); }, resetPassword: async (tok, pw) => { await srv!.resetPassword(tok, pw); }, changePassword: async (c, n) => { await srv!.changePassword(c, n); },
      adminUsers, pending, metrics,
      approveSubject: async id => { try { await srv!.adminApprove(id); await load(); notify('Subject approved'); } catch (e) { fail(e); throw e; } },
      rejectSubject: async id => { try { await srv!.adminReject(id); await load(); notify('Subject rejected and removed'); } catch (e) { fail(e); throw e; } },
      block: async uid => { try { await srv!.blockUser(uid); setConvos(prev => mergeConvos(prev, prev)); notify('User blocked'); const cv = await srv!.getConversations(); setConvos(p => mergeConvos(p, cv)); } catch (e) { fail(e); throw e; } },
      reportMessage: async (mid, reason) => { try { await srv!.reportMessage(mid, reason); notify('Report sent to the moderators'); } catch (e) { fail(e); throw e; } },
      saved, toggleSave: async id => {
        const on = !saved.includes(id);
        try { if (srv) await srv.setSavedTopic(id, on); setSaved(xs => (on ? (xs.includes(id) ? xs : [...xs, id]) : xs.filter(x => x !== id))); }
        catch (e) { fail(e); throw e; }
      },
      mySubjects: cat.subjects.filter(x => user.savedSubjectIds.includes(x.id)),
      addSubjects: async ids => {
        const have = new Set(user.savedSubjectIds); const fresh = [...new Set(ids)].filter(i => !have.has(i));
        try {
          if (srv && fresh.length) await Promise.all(fresh.map(i => srv.setMySubject(i, true)));
          if (fresh.length) setUser(u => ({ ...u, savedSubjectIds: [...new Set([...u.savedSubjectIds, ...fresh])] }));
          return { added: fresh.length, already: ids.length - fresh.length };
        } catch (e) { fail(e); throw e; }
      },
      removeSubject: async id => { try { if (srv) await srv.setMySubject(id, false); setUser(u => ({ ...u, savedSubjectIds: u.savedSubjectIds.filter(x => x !== id) })); } catch (e) { fail(e); throw e; } }, // personal list only; never touches the catalog
      publishSubject: async i => {
        const res = await api.publishSubject(i); // throws on failure: nothing below runs, so the UI cannot claim success
        setCat(c => ({ ...c, subjects: [...c.subjects, res.subject], units: [...c.units, ...res.units], topics: [...c.topics, ...res.topics] }));
        setUser(u => (u.savedSubjectIds.includes(res.subject.id) ? u : { ...u, savedSubjectIds: [...u.savedSubjectIds, res.subject.id] }));
        return res;
      },
      addTopic: async i => {
        const res = await api.addTopic(i); // throws on failure: the topic is added locally only after confirmation
        setCat(c => ({ ...c, topics: [...c.topics, res.topic], units: res.unit ? [...c.units, res.unit] : c.units })); return res.topic;
      },
      topicRelationships: cat.relationships,
      addTopicRelationship: async (sourceTopicId, targetTopicId, type) => {
        try { const row = await api.createTopicRelationship(sourceTopicId, targetTopicId, type); setCat(c => ({ ...c, relationships: [...c.relationships, row] })); return row; }
        catch (e) { fail(e); throw e; }
      },
      removeTopicRelationship: async (topicId, relationshipId) => {
        try { await api.deleteTopicRelationship(topicId, relationshipId); setCat(c => ({ ...c, relationships: c.relationships.filter(r => r.id !== relationshipId) })); }
        catch (e) { fail(e); throw e; }
      },
      drafts, saveDraft: async d => { try { const row = srv ? await srv.saveDraft(d) : d; setDrafts(ds => (ds.some(y => y.id === row.id) ? ds.map(y => (y.id === row.id ? row : y)) : [...ds, row])); } catch (e) { fail(e); throw e; } },
      deleteDraft: async id => { try { if (srv) await srv.deleteDraft(id); setDrafts(ds => ds.filter(x => x.id !== id)); } catch (e) { fail(e); throw e; } },
      plans,
      addPlan: async p => { try { const row = srv ? await srv.createPlan(p) : { ...p, id: uid('p') }; setPlans(x => [...x, row]); if (srv) await refreshStreak(); return row; } catch (e) { fail(e); throw e; } },
      updatePlan: async (id, p) => { try { const row = srv ? await srv.updatePlan(id, p) : (plans.find(i => i.id === id) ? { ...plans.find(i => i.id === id)!, ...p } : null); if (row) setPlans(x => x.map(i => (i.id === id ? row : i))); if (srv && 'status' in p) await refreshStreak(); } catch (e) { fail(e); throw e; } },
      setPlanStatus: async (id, status) => { try { const row = srv ? await srv.updatePlan(id, { status }) : (plans.find(i => i.id === id) ? { ...plans.find(i => i.id === id)!, status } : null); if (row) setPlans(x => x.map(i => (i.id === id ? row : i))); if (srv) await refreshStreak(); } catch (e) { fail(e); throw e; } },
      removePlan: async id => { try { if (srv) await srv.deletePlan(id); setPlans(x => x.filter(p => p.id !== id)); setUserNotes(ns => ns.map(n => n.planId === id ? { ...n, planId: undefined } : n)); } catch (e) { fail(e); throw e; } },
      userNotes,
      deleteNote: async id => { try { if (srv) await srv.deleteNote(id); setUserNotes(ns => ns.filter(n => n.id !== id)); } catch (e) { fail(e); throw e; } },
      saveNote: async n => { try { if (!srv) { const now = new Date().toISOString(); setUserNotes(ns => (n.id && ns.some(x => x.id === n.id) ? ns.map(x => (x.id === n.id ? { ...x, ...n, updatedAt: now } : x)) : [...ns, { ...n, id: uid('nt'), createdAt: now, updatedAt: now }])); return; } const row = await srv.saveNote(n); setUserNotes(ns => (ns.some(x => x.id === row.id) ? ns.map(x => (x.id === row.id ? row : x)) : [row, ...ns])); } catch (e) { fail(e); throw e; } },
      notes,
      markRead: async id => { try { if (srv) await srv.markNotification(id); setNotes(n => n.map(x => (x.id === id ? { ...x, read: true } : x))); } catch (e) { fail(e); throw e; } },
      markAllRead: async () => { try { if (srv) await srv.markAllNotifications(); setNotes(n => n.map(x => ({ ...x, read: true }))); } catch (e) { fail(e); throw e; } },
      askGroups,
      convos,
      startConvo: async (seniorId, draft) => {
        const ex = convos.find(c => c.seniorId === seniorId);
        if (ex) { if (!ex.draft && !ex.messages.length) setConvos(cs => cs.map(c => (c.id === ex.id ? { ...c, draft } : c))); return ex.id; }
        // With a srv, nothing is created until the person presses Send: the starter text is only an editable draft.
        const id = srv ? `new:${seniorId}` : uid('c'); setConvos(cs => [{ id, seniorId, messages: [], unread: 0, draft }, ...cs]); return id;
      },
      setDraft: (id, text) => setConvos(cs => cs.map(c => (c.id === id ? { ...c, draft: text } : c))),
      send: async id => {
        const c = convos.find(x => x.id === id); if (!c || !c.draft.trim()) return id; const text = c.draft.trim();
        if (!srv) { setConvos(cs => cs.map(x => (x.id === id ? { ...x, draft: '', messages: [...x.messages, { id: uid('m'), from: 'me', text, at: 'Just now (local demo)' }] } : x))); return id; }
        try {
          if (id.startsWith('new:')) { const real = await srv.startConversation(c.seniorId, text); setConvos(cs => [real, ...cs.filter(x => x.id !== id && x.id !== real.id)]); return real.id; }
          await srv.sendMessage(id, text); const cv = await srv.getConversations(); setConvos(prev => mergeConvos(prev.map(x => (x.id === id ? { ...x, draft: '' } : x)), cv)); return id;
        } catch (e) { fail(e); throw e; } // the draft stays in the box so nothing is lost
      },
      readConvo: id => { const c = convos.find(x => x.id === id); if (!c || !c.unread) return; const set = () => setConvos(cs => cs.map(x => (x.id === id ? { ...x, unread: 0 } : x))); if (!srv || id.startsWith('new:')) set(); else act(async () => { await srv.markConversationRead(id); set(); }); },
      // One rating per user per topic: the srv (or demo adapter) upserts; local state only changes after it confirms.
      saveRating: async r => {
        const row = await api.submitRating({ ...r, accountType: user.accountType ?? 'Junior' });
        setRatings(rs => { const i = rs.findIndex(x => x.topicId === row.topicId && x.userId === ME); return i >= 0 ? rs.map((x, k) => (k === i ? row : x)) : [...rs, row]; });
        if (srv) { try { const fresh = await srv.getTopicSummary(row.topicId); setApiSummaries(current => ({ ...current, [row.topicId]: fresh })); } catch { /* Rating was saved; retain the existing summary until the next reload. */ } }
        return row;
      },
      reports, resolveReport: async id => { try { if (srv) await srv.adminResolveReport(id); setReports(rs => rs.map(r => (r.id === id ? { ...r, status: 'Resolved' } : r))); } catch (e) { fail(e); throw e; } },
      summary, toast, notify, notifyUndo, canUndo: !!undoAction, runUndo, theme, setTheme,
    };
  }, [loading, loadError, load, authStatus, adminUsers, pending, metrics, cat, people, ratings, apiSummaries, user, saved, plans, userNotes, drafts, notes, convos, reports, summary, toast, notify, notifyUndo, undoAction, runUndo, fail, theme, askGroups]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
