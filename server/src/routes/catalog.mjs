import { ApiError, conflict, forbidden, notFound } from '../lib/errors.mjs';
import { validator } from '../lib/validate.mjs';
import { newId } from '../lib/crypto.mjs';
import { isUnique, norm, nowIso, tx } from '../db.mjs';
import { HELPER_MIN_SEMESTER, isValidSemester } from '../domain/academic.mjs';
import { summarizeTopic } from '../domain/priority.mjs';
import { contributorDto, planDto, q, ratingDto, seniorDtos, subjectDto, topicDto, unitDto, levelLabel } from '../dto.mjs';
import { findVisibleSubject, findVisibleTopic, getSettings, visibleSubjectSql } from '../services.mjs';

const vis = (u, a = 's') => visibleSubjectSql(u).replaceAll('status', `${a}.status`).replaceAll('created_by', `${a}.created_by`);

function readTopicInput(v, prefix = '') {
  const o = {};
  o.name = v.str(`${prefix}name`, { min: 2, max: 80 });
  o.unit = v.str(`${prefix}unit`, { max: 80, optional: true }) ?? '';
  o.description = v.str(`${prefix}description`, { max: 500, optional: true }) ?? '';
  o.hours = v.num(`${prefix}hours`, { min: 0.5, max: 200, optional: true });
  return o;
}

function ensureUnit(db, subjectId, unitName) {
  const name = unitName || 'General';
  const ex = q.get(db, 'SELECT * FROM units WHERE subject_id = ? AND name_norm = ?', subjectId, norm(name));
  if (ex) return { unit: ex, created: false };

  const n = (q.get(db, 'SELECT max(unit_number) m FROM units WHERE subject_id = ?', subjectId).m ?? 0) + 1;
  const id = newId();
  q.run(db, 'INSERT INTO units (id, subject_id, name, name_norm, unit_number) VALUES (?,?,?,?,?)', id, subjectId, name, norm(name), n);
  return { unit: q.get(db, 'SELECT * FROM units WHERE id = ?', id), created: true };
}

export function register(r) {
  r.add('GET', '/catalog', { auth: true }, ({ db, user }) => {
    const subjects = q.all(db, `
      SELECT s.*, u.id author_user_id, u.pid author_pid, u.name author_name,
             u.public_profile author_public_profile, u.account_type author_level
      FROM subjects s
      LEFT JOIN users u ON u.id = s.created_by
      WHERE ${vis(user)}
      ORDER BY s.name
    `);

    const units = q.all(db, `
      SELECT u.*
      FROM units u
      JOIN subjects s ON s.id = u.subject_id
      WHERE ${vis(user)}
      ORDER BY u.unit_number
    `);

    const topics = q.all(db, `
      SELECT t.*, u.id author_user_id, u.pid author_pid, u.name author_name,
             u.public_profile author_public_profile, u.account_type author_level
      FROM topics t
      JOIN subjects s ON s.id = t.subject_id
      LEFT JOIN users u ON u.id = t.created_by
      WHERE ${vis(user)}
      ORDER BY t.name
    `);

    const relationships = q.all(db, `
      SELECT tr.*
      FROM topic_relationships tr
      JOIN subjects s ON s.id = tr.subject_id
      WHERE ${vis(user)}
      ORDER BY tr.created_at
    `);

    // One ratings pass supplies both the rating DTOs and the distinct contributor directory.
    // Keep only fields used by ratingDto/contributorDto; avoid a second full ratings scan.
    const rows = q.all(db, `
      SELECT
        r.id,
        r.user_id,
        r.topic_id,
        r.importance,
        r.difficulty,
        r.exam,
        r.interview,
        r.advice,
        r.mistakes,
        r.level,
        r.updated_at,
        r.account_type,
        u.pid,
        u.public_profile,
        u.name AS uname,
        u.branch AS ubranch,
        u.department AS udept,
        u.account_type AS ulevel
      FROM ratings r
      JOIN users u ON u.id = r.user_id
      JOIN topics t ON t.id = r.topic_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE ${vis(user)}
      ORDER BY r.updated_at DESC
    `);

    // Rows are newest-first, so the first rating for each person preserves contributor ordering.
    const seen = new Map();
    for (const row of rows) {
      if (!seen.has(row.pid)) {
        seen.set(row.pid, contributorDto({
          pid: row.pid,
          public_profile: row.public_profile,
          name: row.uname,
          branch: row.ubranch,
          department: row.udept,
          account_type: row.ulevel
        }));
      }
    }
    const contributors = [...seen.values()];

    const seniorUsers = q.all(db, `
      SELECT *
      FROM users
      WHERE role = 'STUDENT'
        AND semester >= ?
        AND available = 1
        AND public_profile = 1
        AND id <> ?
      ORDER BY name
    `, HELPER_MIN_SEMESTER, user.id);

    const seniors = seniorDtos(db, seniorUsers, user.id, HELPER_MIN_SEMESTER);

    return {
      subjects: subjects.map(s => subjectDto(s, user.id)),
      units: units.map(unitDto),
      topics: topics.map(t => topicDto(
        t,
        t.author_pid && (
          t.author_public_profile || Number(t.author_user_id) === Number(user.id)
        )
          ? {
              id: t.author_pid,
              name: t.author_name,
              ...(levelLabel(t.author_level) ? { level: levelLabel(t.author_level) } : {})
            }
          : undefined
      )),
      relationships: relationships.map(x => ({
        id: x.id,
        subjectId: x.subject_id,
        sourceTopicId: x.source_topic_id,
        targetTopicId: x.target_topic_id,
        type: x.relationship_type,
        createdAt: x.created_at,
        isMine: Number(x.created_by) === Number(user.id)
      })),
      ratings: rows.map(x => ratingDto(x, user.id)),
      seniors,
      contributors
    };
  });

  r.add('POST', '/subjects', { auth: 'student', limit: ['publish', 86_400_000, 20, 'You have published many subjects today. Please try again tomorrow.'] }, ({ body, db, user, config, status }) => {
    const v = validator(body);
    const settings = getSettings(db);
    const name = v.str('name', { min: 3, max: 80 });
    const branch = v.str('branch', { min: 2, max: 120 });
    const semester = v.int('semester', { min: 1, max: 12 });
    const description = v.str('description', { max: 500, optional: true }) ?? '';
    if (semester !== undefined && !isValidSemester(semester, settings)) v.issue('semester', `Must be from 1 to ${settings.maxSemester}.`);

    const rawTopics = v.raw('topics');
    const topics = [];
    if (!Array.isArray(rawTopics) || !rawTopics.length) v.issue('topics', 'Add at least one topic.');
    else if (rawTopics.length > 60) v.issue('topics', 'At most 60 topics per subject.');
    else rawTopics.forEach((t, i) => {
      const tv = validator(t);
      const o = readTopicInput(tv);
      try {
        tv.done();
        topics.push(o);
      } catch (e) {
        for (const x of e.details ?? []) v.issue(`topics.${i}.${x.field}`, x.message);
      }
    });

    v.done();
    const seen = new Set();
    for (const t of topics) {
      const k = norm(t.name);
      if (seen.has(k)) throw new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.', [{ field: 'topics', message: `Duplicate topic: ${t.name}` }]);
      seen.add(k);
    }

    const result = tx(db, () => { // all or nothing: a subject is never half-created
      const id = newId();
      const state = config.requireSubjectReview ? 'PENDING_REVIEW' : 'PUBLISHED';
      try {
        q.run(db, 'INSERT INTO subjects (id, name, name_norm, description, department, semester, code, created_by, status) VALUES (?,?,?,?,?,?,NULL,?,?)', id, name, norm(name), description, branch, semester, user.id, state);
      } catch (e) {
        if (isUnique(e)) throw conflict('DUPLICATE_SUBJECT', 'A subject with this name already exists for that branch and semester.');
        throw e;
      }

      const units = new Map();
      const outTopics = [];
      for (const t of topics) {
        const { unit } = ensureUnit(db, id, t.unit);
        units.set(unit.id, unit);
        const tid = newId();
        q.run(db, 'INSERT INTO topics (id, subject_id, unit_id, name, name_norm, description, hours, created_by) VALUES (?,?,?,?,?,?,?,?)', tid, id, unit.id, t.name, norm(t.name), t.description, t.hours ?? null, user.id);
        outTopics.push(q.get(db, 'SELECT * FROM topics WHERE id = ?', tid));
      }
      q.run(db, 'INSERT OR IGNORE INTO user_subjects (user_id, subject_id) VALUES (?,?)', user.id, id);
      return {
        subject: q.get(db, 'SELECT * FROM subjects WHERE id = ?', id),
        units: [...units.values()],
        topics: outTopics
      };
    });

    status(201);
    const author = user.public_profile
      ? { id: user.pid, name: user.name, ...(levelLabel(user.account_type ?? user.level) ? { level: levelLabel(user.account_type ?? user.level) } : {}) }
      : undefined;
    return {
      subject: subjectDto(result.subject, user.id, author),
      units: result.units.map(unitDto),
      topics: result.topics.map(t => topicDto(t, author))
    };
  });

  r.add('POST', '/subjects/:id/topics', { auth: 'student', limit: ['topic', 86_400_000, 100] }, ({ body, params, db, user, status }) => {
    const s = findVisibleSubject(db, user, params.id);
    if (!s) throw notFound('That subject is not available.');
    if (s.status === 'PENDING_REVIEW' && s.created_by !== user.id) throw forbidden('This subject is pending review.');

    const v = validator(body);
    const t = readTopicInput(v);
    v.done();
    if (q.get(db, 'SELECT 1 x FROM topics WHERE subject_id = ? AND name_norm = ?', s.id, norm(t.name))) throw conflict('DUPLICATE_TOPIC', 'This topic already exists in this subject.');

    const out = tx(db, () => {
      const { unit, created } = ensureUnit(db, s.id, t.unit);
      const tid = newId();
      q.run(db, 'INSERT INTO topics (id, subject_id, unit_id, name, name_norm, description, hours, created_by) VALUES (?,?,?,?,?,?,?,?)', tid, s.id, unit.id, t.name, norm(t.name), t.description, t.hours ?? null, user.id);
      return { topic: q.get(db, 'SELECT * FROM topics WHERE id = ?', tid), unit: created ? unit : undefined };
    });

    status(201);
    const author = user.public_profile
      ? { id: user.pid, name: user.name, ...(levelLabel(user.account_type ?? user.level) ? { level: levelLabel(user.account_type ?? user.level) } : {}) }
      : undefined;
    return { topic: topicDto(out.topic, author), ...(out.unit ? { unit: unitDto(out.unit) } : {}) };
  });

  r.add('POST', '/topics/:id/ratings', { auth: 'student', limit: ['rate', 3600_000, 200] }, ({ body, params, db, user, status }) => {
    const t = findVisibleTopic(db, user, params.id);
    if (!t) throw notFound('That topic is not available for rating.');
    const s = q.get(db, 'SELECT * FROM subjects WHERE id = ?', t.subject_id);
    if (s.status !== 'PUBLISHED') throw forbidden('This subject is pending review and cannot be rated yet.');

    const v = validator(body);
    const f = {
      importance: v.int('importance', { min: 1, max: 5 }),
      difficulty: v.int('difficulty', { min: 1, max: 5 }),
      exam: v.int('exam', { min: 1, max: 5 }),
      interview: v.int('interview', { min: 1, max: 5 }),
      advice: v.text('advice', { max: 1000, optional: true }) ?? '',
      mistakes: v.text('mistakes', { max: 1000, optional: true }) ?? ''
    };
    v.done();

    const now = nowIso();
    const existing = q.get(db, 'SELECT id FROM ratings WHERE user_id = ? AND topic_id = ?', user.id, t.id);
    q.run(db, `INSERT INTO ratings (id, user_id, topic_id, importance, difficulty, exam, interview, advice, mistakes, level, account_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT (user_id, topic_id) DO UPDATE SET importance=excluded.importance, difficulty=excluded.difficulty, exam=excluded.exam, interview=excluded.interview, advice=excluded.advice, mistakes=excluded.mistakes, level=excluded.level, account_type=excluded.account_type, updated_at=excluded.updated_at`,
      newId(), user.id, t.id, f.importance, f.difficulty, f.exam, f.interview, f.advice.trim(), f.mistakes.trim(), user.level, user.account_type, now, now); // Account category is user-selected; semester remains independent
    status(existing ? 200 : 201);
    return ratingDto({ ...q.get(db, 'SELECT * FROM ratings WHERE user_id = ? AND topic_id = ?', user.id, t.id), pid: user.pid }, user.id);
  });

  // Bulk summaries keep dashboard and Explore scores authoritative and consistent with topic details.
  r.add('GET', '/topics/summaries', { auth: true }, ({ db, user }) => {
    const rows = q.all(db, `
      SELECT t.id topic_id, r.importance, r.difficulty, r.exam, r.interview, r.account_type AS level
      FROM topics t
      JOIN subjects s ON s.id = t.subject_id
      LEFT JOIN ratings r ON r.topic_id = t.id
      WHERE ${vis(user)}
      ORDER BY t.id
    `);
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.topic_id)) grouped.set(row.topic_id, []);
      if (row.importance !== null && row.importance !== undefined) grouped.get(row.topic_id).push(row);
    }
    return Object.fromEntries([...grouped.entries()].map(([id, rs]) => [id, summarizeTopic(rs)]));
  });

  r.add('GET', '/topics/:id/summary', { auth: true }, ({ params, db, user }) => {
    const t = findVisibleTopic(db, user, params.id);
    if (!t) throw notFound();
    return summarizeTopic(q.all(db, 'SELECT importance, difficulty, exam, interview, account_type AS level FROM ratings WHERE topic_id = ?', t.id));
  });
}

void planDto;
