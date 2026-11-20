import { ApiError, notFound } from '../lib/errors.mjs';
import { validator } from '../lib/validate.mjs';
import { newId } from '../lib/crypto.mjs';
import { nowIso, tx } from '../db.mjs';
import { validateYears } from '../domain/years.mjs';
import { HELPER_MIN_SEMESTER } from '../domain/academic.mjs';
import { STATUS_IN, noteDto, notificationDto, planDto, q, today, userDto } from '../dto.mjs';
import { findVisibleSubject, findVisibleTopic } from '../services.mjs';
import { conversationsFor } from './social.mjs';

const PURPOSES = ['EXAMS', 'HIGHER_STUDIES', 'CONCEPTUAL', 'INTERVIEW', 'REVISION', 'PROJECTS', 'PERSONAL', 'OTHER'];
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const draftOut = d => ({ ...JSON.parse(d.data), id: d.id, updatedAt: d.updated_at });

export function register(r) {
  r.add('GET', '/profile', { auth: true }, ({ db, user }) => ({ user: userDto(db, user) }));
  r.add('PATCH', '/profile', { auth: true }, ({ body, db, user }) => {
    const v = validator(body); const isAdmin = user.role === 'ADMIN'; const d = {};
    d.name = v.str('name', { min: 2, max: 80, optional: true }); d.college = v.str('college', { min: 2, max: 160, optional: true }); d.department = v.str('department', { min: 2, max: 120, optional: true });
    d.branch = v.str('branch', { min: 2, max: 120, optional: true, nullable: true }); d.enrollment_number = v.str('enrollmentNumber', { min: 1, max: 40, optional: true, nullable: true });
    d.bio = v.text('bio', { max: 300, optional: true }); d.available = v.bool('available', { optional: true }); d.public_profile = v.bool('publicProfile', { optional: true }); d.theme = v.oneOf('theme', ['light', 'dark'], { optional: true });
    const accountType = v.oneOf('accountType', ['JUNIOR','SENIOR','CANDIDATE'], { optional: true });
    if (accountType !== undefined) { if (user.role !== 'STUDENT' || user.account_type_selected) v.issue('accountType', 'Your account category has already been confirmed and cannot be changed here.'); else { d.account_type = accountType; d.account_type_selected = 1; } }
    d.enrollment_year = v.int('enrollmentYear', { optional: true }); d.graduation_year = v.int('graduationYear', { optional: true });
    v.done(); // role, legacy level, semester, email and password remain protected; legacy students may confirm accountType once
    if (!isAdmin && user.semester < HELPER_MIN_SEMESTER && d.available === true) throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', [{ field: 'available', message: 'Helper availability starts at semester 3.' }]);
    if (isAdmin && (d.enrollment_year !== undefined || d.graduation_year !== undefined)) throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', [{ field: 'enrollmentYear', message: 'Not applicable to administrator accounts.' }]);
    if (!isAdmin) { const errs = validateYears({ enrollmentYear: d.enrollment_year ?? user.enrollment_year, graduationYear: d.graduation_year ?? user.graduation_year, currentSemester: user.semester });
      if (Object.keys(errs).length) throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', Object.entries(errs).map(([field, message]) => ({ field, message }))); }
    const cols = Object.entries(d).filter(([, x]) => x !== undefined); if (!cols.length) throw new ApiError(422, 'VALIDATION_ERROR', 'Provide at least one field to update.', [{ field: 'body', message: 'Nothing to update.' }]);
    q.run(db, `UPDATE users SET ${cols.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`, ...cols.map(([, x]) => (typeof x === 'boolean' ? Number(x) : x)), user.id);
    return { user: userDto(db, q.get(db, 'SELECT * FROM users WHERE id = ?', user.id)) };
  });

  // everything the dashboard needs after sign-in, in one request
  r.add('GET', '/me/state', { auth: true }, ({ db, user }) => ({
    user: userDto(db, user), saved: q.all(db, 'SELECT topic_id FROM saved_topics WHERE user_id = ?', user.id).map(x => x.topic_id),
    plans: q.all(db, 'SELECT * FROM plans WHERE user_id = ? ORDER BY target_date, created_at', user.id).map(planDto), notes: q.all(db, 'SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC', user.id).map(noteDto),
    drafts: q.all(db, 'SELECT * FROM drafts WHERE user_id = ? ORDER BY updated_at DESC', user.id).map(draftOut), notifications: q.all(db, 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', user.id).map(notificationDto),
    conversations: conversationsFor(db, user),
  }));

  r.add('PUT', '/me/subjects/:id', { auth: 'student' }, ({ params, db, user }) => { if (!findVisibleSubject(db, user, params.id)) throw notFound('That subject is not available.'); q.run(db, 'INSERT OR IGNORE INTO user_subjects (user_id, subject_id) VALUES (?,?)', user.id, params.id); return { added: true }; });
  r.add('DELETE', '/me/subjects/:id', { auth: 'student' }, ({ params, db, user }) => { q.run(db, 'DELETE FROM user_subjects WHERE user_id = ? AND subject_id = ?', user.id, params.id); return { removed: true }; }); // personal list only: the shared catalog is never touched
  r.add('PUT', '/me/saved-topics/:id', { auth: 'student' }, ({ params, db, user }) => { if (!findVisibleTopic(db, user, params.id)) throw notFound('That topic is not available.'); q.run(db, 'INSERT OR IGNORE INTO saved_topics (user_id, topic_id) VALUES (?,?)', user.id, params.id); return { saved: true }; });
  r.add('DELETE', '/me/saved-topics/:id', { auth: 'student' }, ({ params, db, user }) => { q.run(db, 'DELETE FROM saved_topics WHERE user_id = ? AND topic_id = ?', user.id, params.id); return { saved: false }; });

  // ---- planner
  const readPlan = (v, { partial }) => {
    const o = { topic: v.str('topicId', { min: 1, max: 80, optional: partial }), target: v.str('target', { optional: partial }), minutes: v.int('minutes', { min: 5, max: 600, optional: partial }), status: v.oneOf('status', Object.keys(STATUS_IN), { optional: true }) };
    if (o.target !== undefined && !isDate(o.target)) v.issue('target', 'Use a valid date (YYYY-MM-DD).');
    o.purpose = v.raw('purpose', { optional: true }); o.custom = v.raw('customPurpose', { optional: true });
    if (o.purpose !== undefined && o.purpose !== null && !PURPOSES.includes(o.purpose)) v.issue('purpose', 'Unknown purpose.');
    if (o.purpose === 'OTHER') { if (typeof o.custom !== 'string' || !o.custom.replace(/\s+/g, ' ').trim()) v.issue('customPurpose', 'Enter your custom purpose.'); else if (o.custom.trim().length > 60) v.issue('customPurpose', 'Use at most 60 characters.'); }
    else if (o.custom != null && o.purpose !== undefined) v.issue('customPurpose', 'Only used with the "Other" purpose.');
    return o;
  };
  r.add('POST', '/me/plans', { auth: 'student', limit: ['plan', 3600_000, 300] }, ({ body, db, user, status }) => {
    const v = validator(body); const o = readPlan(v, { partial: false }); v.done(); if (!findVisibleTopic(db, user, o.topic)) throw notFound('That topic is not available.');
    const id = newId(); const done = o.status === 'Completed';
    tx(db, () => { q.run(db, 'INSERT INTO plans (id, user_id, topic_id, target_date, minutes, status, purpose, custom_purpose, completed_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', id, user.id, o.topic, o.target, o.minutes, STATUS_IN[o.status ?? 'Planned'], o.purpose ?? null, o.purpose === 'OTHER' ? o.custom.replace(/\s+/g, ' ').trim() : null, done ? nowIso() : null, nowIso());
      if (done) q.run(db, `INSERT OR IGNORE INTO activity (id, user_id, plan_id, kind, minutes, day) VALUES (?,?,?,'PLAN_COMPLETED',?,?)`, newId(), user.id, id, o.minutes, today()); });
    status(201); return planDto(q.get(db, 'SELECT * FROM plans WHERE id = ?', id));
  });
  r.add('PATCH', '/me/plans/:id', { auth: 'student' }, ({ body, params, db, user }) => {
    const p = q.get(db, 'SELECT * FROM plans WHERE id = ? AND user_id = ?', params.id, user.id); if (!p) throw notFound('Plan item not found.'); // someone else's plan looks like it does not exist
    const v = validator(body); const o = readPlan(v, { partial: true }); if (o.topic !== undefined) v.issue('topicId', 'The topic of a plan item cannot be changed.'); v.done();
    const status = o.status ? STATUS_IN[o.status] : p.status; const purpose = o.purpose === undefined ? p.purpose : o.purpose; const custom = purpose === 'OTHER' ? (o.custom !== undefined ? o.custom.replace(/\s+/g, ' ').trim() : p.custom_purpose) : null;
    if (purpose === 'OTHER' && !custom) throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', [{ field: 'customPurpose', message: 'Enter your custom purpose.' }]);
    tx(db, () => {
      q.run(db, 'UPDATE plans SET target_date = ?, minutes = ?, status = ?, purpose = ?, custom_purpose = ?, completed_at = ? WHERE id = ?', o.target ?? p.target_date, o.minutes ?? p.minutes, status, purpose, custom, status === 'COMPLETED' ? (p.completed_at ?? nowIso()) : null, p.id);
      // completing a plan is the only thing that creates study activity; UNIQUE(plan_id, kind) means re-completing never double-counts
      if (status === 'COMPLETED' && p.status !== 'COMPLETED') q.run(db, `INSERT OR IGNORE INTO activity (id, user_id, plan_id, kind, minutes, day) VALUES (?,?,?,'PLAN_COMPLETED',?,?)`, newId(), user.id, p.id, o.minutes ?? p.minutes, today());
    });
    return planDto(q.get(db, 'SELECT * FROM plans WHERE id = ?', p.id));
  });
  r.add('DELETE', '/me/plans/:id', { auth: 'student' }, ({ params, db, user }) => { q.run(db, 'DELETE FROM plans WHERE id = ? AND user_id = ?', params.id, user.id); return { removed: true }; });

  // ---- private notes (only the owner can ever read them)
  const readNote = (v, partial) => ({ title: v.str('title', { min: 1, max: 80, optional: partial }), body: v.text('body', { min: 1, max: 2000, optional: partial }), subjectId: v.str('subjectId', { max: 80, optional: true, nullable: true }), topicId: v.str('topicId', { max: 80, optional: true, nullable: true }), planId: v.str('planId', { max: 80, optional: true, nullable: true }) });
  const checkLinks = (db, user, o) => {
    if (o.subjectId && !findVisibleSubject(db, user, o.subjectId)) throw notFound('Linked subject not found.'); if (o.topicId && !findVisibleTopic(db, user, o.topicId)) throw notFound('Linked topic not found.');
    if (o.planId && !q.get(db, 'SELECT 1 x FROM plans WHERE id = ? AND user_id = ?', o.planId, user.id)) throw notFound('Linked plan item not found.');
  };
  r.add('POST', '/me/notes', { auth: 'student', limit: ['note', 3600_000, 300] }, ({ body, db, user, status }) => {
    const v = validator(body); const o = readNote(v, false); v.done(); checkLinks(db, user, o); const id = newId(); const now = nowIso();
    q.run(db, 'INSERT INTO notes (id, user_id, title, body, subject_id, topic_id, plan_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)', id, user.id, o.title, o.body.trim(), o.subjectId ?? null, o.topicId ?? null, o.planId ?? null, now, now); status(201); return noteDto(q.get(db, 'SELECT * FROM notes WHERE id = ?', id));
  });
  r.add('PATCH', '/me/notes/:id', { auth: 'student' }, ({ body, params, db, user }) => {
    const n = q.get(db, 'SELECT * FROM notes WHERE id = ? AND user_id = ?', params.id, user.id); if (!n) throw notFound('Note not found.'); const v = validator(body); const o = readNote(v, true); v.done(); checkLinks(db, user, o);
    q.run(db, 'UPDATE notes SET title = ?, body = ?, subject_id = ?, topic_id = ?, plan_id = ?, updated_at = ? WHERE id = ?', o.title ?? n.title, o.body !== undefined ? o.body.trim() : n.body, o.subjectId === undefined ? n.subject_id : o.subjectId, o.topicId === undefined ? n.topic_id : o.topicId, o.planId === undefined ? n.plan_id : o.planId, nowIso(), n.id);
    return noteDto(q.get(db, 'SELECT * FROM notes WHERE id = ?', n.id));
  });
  r.add('DELETE', '/me/notes/:id', { auth: 'student' }, ({ params, db, user }) => { q.run(db, 'DELETE FROM notes WHERE id = ? AND user_id = ?', params.id, user.id); return { removed: true }; });

  // ---- private subject drafts
  r.add('PUT', '/me/drafts/:id', { auth: 'student' }, ({ body, params, db, user }) => {
    if (!/^[\w-]{1,60}$/.test(params.id)) throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', [{ field: 'id', message: 'Invalid draft id.' }]);
    const v = validator(body); const d = { name: v.text('name', { max: 120, optional: true }) ?? '', branch: v.str('branch', { max: 120, optional: true }) ?? '', semester: v.int('semester', { min: 1, max: 12, optional: true }) ?? 1, description: v.text('description', { max: 500, optional: true }) ?? '', topics: v.raw('topics', { optional: true }) ?? [] };
    v.raw('id', { optional: true }); v.raw('updatedAt', { optional: true }); if (!Array.isArray(d.topics) || d.topics.length > 60) v.issue('topics', 'Expected up to 60 topics.'); v.done(); const now = nowIso();
    q.run(db, 'INSERT INTO drafts (id, user_id, data, updated_at) VALUES (?,?,?,?) ON CONFLICT (user_id, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at', params.id, user.id, JSON.stringify(d), now);
    return draftOut(q.get(db, 'SELECT * FROM drafts WHERE id = ? AND user_id = ?', params.id, user.id));
  });
  r.add('DELETE', '/me/drafts/:id', { auth: 'student' }, ({ params, db, user }) => { q.run(db, 'DELETE FROM drafts WHERE id = ? AND user_id = ?', params.id, user.id); return { removed: true }; });

  // ---- notifications
  r.add('GET', '/me/notifications', { auth: true }, ({ db, user }) => q.all(db, 'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', user.id).map(notificationDto));
  r.add('POST', '/me/notifications/read-all', { auth: true }, ({ db, user }) => { q.run(db, 'UPDATE notifications SET read = 1 WHERE user_id = ?', user.id); return { read: true }; });
  r.add('POST', '/me/notifications/:id/read', { auth: true }, ({ params, db, user }) => { q.run(db, 'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', params.id, user.id); return { read: true }; });
}
