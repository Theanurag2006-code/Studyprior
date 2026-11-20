import { ApiError, notFound } from '../lib/errors.mjs';
import { nowIso } from '../db.mjs';
import { summarize } from '../domain/priority.mjs';
import { levelLabel, q } from '../dto.mjs';
import { notify } from '../services.mjs';

export function register(r) {
  const one = (db, sql) => q.get(db, sql).c;

  r.add('GET', '/admin/metrics', { auth: 'admin' }, ({ db }) => {
    // Fetch all topic ratings in one joined query instead of issuing one query per topic.
    const topicRatingRows = q.all(db, `
      SELECT
        t.id,
        t.name,
        r.importance,
        r.difficulty,
        r.exam,
        r.interview
      FROM topics t
      LEFT JOIN ratings r ON r.topic_id = t.id
      ORDER BY t.id
    `);

    const grouped = new Map();
    for (const row of topicRatingRows) {
      if (!grouped.has(row.id)) {
        grouped.set(row.id, { id: row.id, name: row.name, ratings: [] });
      }
      if (row.importance !== null) {
        grouped.get(row.id).ratings.push({
          importance: row.importance,
          difficulty: row.difficulty,
          exam: row.exam,
          interview: row.interview
        });
      }
    }

    const top = [...grouped.values()]
      .map(topic => ({ ...topic, s: summarize(topic.ratings) }))
      .filter(topic => topic.s.sampleCount >= 3)
      .sort((a, b) => b.s.priorityScore - a.s.priorityScore)
      .slice(0, 5);

    return {
      users: one(db, `SELECT count(*) c FROM users WHERE role = 'STUDENT'`),
      juniors: one(db, `SELECT count(*) c FROM users WHERE account_type = 'JUNIOR'`),
      seniors: one(db, `SELECT count(*) c FROM users WHERE account_type = 'SENIOR'`),
      candidates: one(db, `SELECT count(*) c FROM users WHERE account_type = 'CANDIDATE'`),
      admins: one(db, `SELECT count(*) c FROM users WHERE role = 'ADMIN'`),
      subjects: one(db, 'SELECT count(*) c FROM subjects'),
      topics: one(db, 'SELECT count(*) c FROM topics'),
      ratings: one(db, 'SELECT count(*) c FROM ratings'),
      pendingSubjects: one(db, `SELECT count(*) c FROM subjects WHERE status = 'PENDING_REVIEW'`),
      openReports: one(db, `SELECT count(*) c FROM reports WHERE status = 'OPEN'`),
      topTopics: top.map(topic => ({
        id: topic.id,
        name: topic.name,
        score: topic.s.priorityScore,
        label: topic.s.priorityLabel,
        ratings: topic.s.sampleCount
      }))
    };
  });

  r.add('GET', '/admin/users', { auth: 'admin' }, ({ db }) =>
    q.all(db, 'SELECT * FROM users ORDER BY created_at DESC LIMIT 500').map(u => ({
      id: u.pid,
      name: u.name,
      email: u.email,
      role: u.role,
      level: levelLabel(u.account_type ?? u.level),
      accountType: levelLabel(u.account_type ?? u.level),
      semester: u.semester,
      createdAt: u.created_at
    }))
  );

  r.add('GET', '/admin/reports', { auth: 'admin' }, ({ db }) =>
    q.all(db, 'SELECT * FROM reports ORDER BY status, created_at DESC LIMIT 200').map(x => {
      // Admins can read only the content referenced by a report.
      const excerpt = x.kind === 'message'
        ? q.get(db, 'SELECT body FROM messages WHERE id = ?', x.target_id)?.body
        : q.get(db, 'SELECT advice FROM ratings WHERE id = ?', x.target_id)?.advice;
      return {
        id: x.id,
        target: `${x.kind === 'message' ? 'Message' : 'Feedback'}: ${(excerpt ?? '(removed)').slice(0, 120)}`,
        reason: x.reason,
        status: x.status === 'OPEN' ? 'Open' : 'Resolved'
      };
    })
  );

  r.add('POST', '/admin/reports/:id/resolve', { auth: 'admin' }, ({ params, db, user }) => {
    const x = q.get(db, 'SELECT * FROM reports WHERE id = ?', params.id);
    if (!x) throw notFound('Report not found.');
    q.run(db,
      `UPDATE reports SET status = 'RESOLVED', resolved_by = ?, resolved_at = ? WHERE id = ?`,
      user.id, nowIso(), x.id
    );
    return { resolved: true };
  });

  // Count pending-subject topics in one grouped query instead of one count query per subject.
  r.add('GET', '/admin/pending-subjects', { auth: 'admin' }, ({ db }) =>
    q.all(db, `
      SELECT
        s.id,
        s.name,
        s.department,
        s.semester,
        u.name AS owner,
        COUNT(t.id) AS topics
      FROM subjects s
      LEFT JOIN users u ON u.id = s.created_by
      LEFT JOIN topics t ON t.subject_id = s.id
      WHERE s.status = 'PENDING_REVIEW'
      GROUP BY s.id, s.name, s.department, s.semester, u.name, s.created_at
      ORDER BY s.created_at
    `).map(s => ({
      id: s.id,
      name: s.name,
      branch: s.department,
      semester: s.semester,
      owner: s.owner ?? 'Unknown',
      topics: Number(s.topics)
    }))
  );

  r.add('POST', '/admin/subjects/:id/approve', { auth: 'admin' }, ({ params, db }) => {
    const s = q.get(db,
      `SELECT * FROM subjects WHERE id = ? AND status = 'PENDING_REVIEW'`,
      params.id
    );
    if (!s) throw notFound('No pending subject with that id.');
    q.run(db, `UPDATE subjects SET status = 'PUBLISHED' WHERE id = ?`, s.id);
    if (s.created_by) {
      notify(db, s.created_by,
        `Your subject "${s.name}" was approved and is open for ratings`,
        `/subjects/${s.id}`
      );
    }
    return { approved: true };
  });

  r.add('POST', '/admin/subjects/:id/reject', { auth: 'admin' }, ({ params, db }) => {
    const s = q.get(db,
      `SELECT * FROM subjects WHERE id = ? AND status = 'PENDING_REVIEW'`,
      params.id
    );
    if (!s) throw notFound('No pending subject with that id.');
    if (s.created_by) {
      notify(db, s.created_by, `Your subject "${s.name}" was not approved`, '/subjects');
    }
    q.run(db, 'DELETE FROM subjects WHERE id = ?', s.id);
    return { rejected: true };
  });

  void ApiError;
}
