import { yearLabel } from './domain/academic.mjs';
import { computeStreak } from './domain/streak.mjs';

export const today = () => new Date().toISOString().slice(0, 10);
export const levelLabel = l => (l === 'SENIOR' ? 'Senior' : l === 'JUNIOR' ? 'Junior' : l === 'CANDIDATE' ? 'Candidate' : null);
export const STATUS_OUT = { PLANNED: 'Planned', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed' };
export const STATUS_IN = Object.fromEntries(Object.entries(STATUS_OUT).map(([k, v]) => [v, k]));
export const q = { all: (db, sql, ...p) => db.prepare(sql).all(...p), get: (db, sql, ...p) => db.prepare(sql).get(...p), run: (db, sql, ...p) => db.prepare(sql).run(...p) };
export const streakOf = (db, userId) => computeStreak(q.all(db, 'SELECT DISTINCT day FROM activity WHERE user_id = ?', userId).map(r => r.day), today());

/** The only shape in which a user leaves the server (allow-list). Admins have no semester or level. */
export function userDto(db, u) {
  return { id: u.pid, name: u.name, email: u.email, joined: u.created_at.slice(0, 10), department: u.department, branch: u.branch ?? '', college: u.college, enrollment: u.enrollment_number ?? '',
    enrollmentYear: u.enrollment_year ?? 0, graduationYear: u.graduation_year ?? 0, semester: u.semester ?? 0, bio: u.bio, available: !!u.available, publicProfile: !!u.public_profile,
    streak: streakOf(db, u.id), savedSubjectIds: q.all(db, 'SELECT subject_id FROM user_subjects WHERE user_id = ?', u.id).map(r => r.subject_id), role: u.role, level: levelLabel(u.account_type ?? u.level), accountType: levelLabel(u.account_type ?? u.level), accountTypeSelected: !!u.account_type_selected, theme: u.theme };
}
const authorFor = (row, viewerId) => row?.author_pid && (row.author_public_profile || Number(row.author_user_id) === Number(viewerId))
  ? { id: row.author_pid, name: row.author_name, ...(levelLabel(row.author_level) ? { level: levelLabel(row.author_level) } : {}) } : undefined;
export const subjectDto = (s, viewerId, author = authorFor(s, viewerId)) => ({ id: s.id, name: s.name, code: s.code ?? (s.created_by ? 'COMM' : ''), branch: s.department, semester: s.semester, status: s.status, description: s.description,
  community: s.created_by !== null, ...(s.created_by === viewerId ? { ownerId: 'me' } : {}), ...(author ? { author } : {}) });
export const unitDto = u => ({ id: u.id, subjectId: u.subject_id, name: u.name });
export const topicDto = (t, author = authorFor(t, undefined)) => ({ id: t.id, unitId: t.unit_id, subjectId: t.subject_id, name: t.name, description: t.description, ...(t.hours !== null ? { hours: t.hours } : {}), ...(author ? { author } : {}) });
export const ratingDto = (r, viewerId) => ({ id: r.id, topicId: r.topic_id, userId: r.pid, isMine: r.user_id === viewerId, importance: r.importance, difficulty: r.difficulty, exam: r.exam, interview: r.interview, advice: r.advice, mistakes: r.mistakes, at: r.updated_at.slice(0, 10), level: levelLabel(r.account_type ?? r.level), accountType: levelLabel(r.account_type ?? r.level) });
export const planDto = p => ({ id: p.id, topicId: p.topic_id, target: p.target_date, minutes: p.minutes, status: STATUS_OUT[p.status], ...(p.purpose ? { purpose: p.purpose } : {}), ...(p.custom_purpose ? { customPurpose: p.custom_purpose } : {}) });
export const noteDto = n => ({ id: n.id, title: n.title, body: n.body, ...(n.subject_id ? { subjectId: n.subject_id } : {}), ...(n.topic_id ? { topicId: n.topic_id } : {}), ...(n.plan_id ? { planId: n.plan_id } : {}), createdAt: n.created_at, updatedAt: n.updated_at });
export const notificationDto = n => ({ id: n.id, text: n.text, read: !!n.read, to: n.link, at: n.created_at });

export const seniorDto = (db, u) => ({
  id: u.pid,
  name: u.name,
  accountType: levelLabel(u.account_type ?? u.level) ?? 'Junior',
  branch: u.branch ?? u.department,
  year: yearLabel(u.semester),
  semester: u.semester,
  subjects: q.all(db, `SELECT DISTINCT subject_id FROM (
    SELECT id subject_id FROM subjects WHERE created_by=? AND status='PUBLISHED'
    UNION SELECT t.subject_id FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE t.created_by=? AND s.status='PUBLISHED'
  ) ORDER BY subject_id`, u.id, u.id).map(r => r.subject_id),
  contributions: Number(q.get(db, `SELECT
    (SELECT count(*) FROM subjects WHERE created_by=? AND status='PUBLISHED') +
    (SELECT count(*) FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE t.created_by=? AND s.status='PUBLISHED') +
    (SELECT count(*) FROM ratings r JOIN topics t ON t.id=r.topic_id JOIN subjects s ON s.id=t.subject_id WHERE r.user_id=? AND s.status='PUBLISHED' AND (length(trim(r.advice))>0 OR length(trim(r.mistakes))>0)) c`, u.id, u.id, u.id).c),
  bio: u.bio,
  available: !!u.available
});

export const seniorDtos = (db, users, viewerId, minSemester) => {
  if (!users.length) return [];

  const rows = q.all(db, `
    WITH eligible_seniors AS (
      SELECT id FROM users
      WHERE role = 'STUDENT'
        AND semester >= ?
        AND available = 1
        AND public_profile = 1
        AND id <> ?
    ),
    contributions AS (
      SELECT s.created_by AS user_id, s.id AS subject_id
      FROM subjects s
      JOIN eligible_seniors e ON e.id = s.created_by
      WHERE s.status = 'PUBLISHED'

      UNION ALL

      SELECT t.created_by AS user_id, t.subject_id
      FROM topics t
      JOIN subjects s ON s.id = t.subject_id
      JOIN eligible_seniors e ON e.id = t.created_by
      WHERE s.status = 'PUBLISHED'

      UNION ALL

      SELECT r.user_id, NULL AS subject_id
      FROM ratings r
      JOIN topics t ON t.id = r.topic_id
      JOIN subjects s ON s.id = t.subject_id
      JOIN eligible_seniors e ON e.id = r.user_id
      WHERE s.status = 'PUBLISHED'
        AND (
          length(trim(r.advice)) > 0
          OR length(trim(r.mistakes)) > 0
        )
    )
    SELECT user_id, subject_id FROM contributions
    ORDER BY user_id, subject_id
  `, minSemester, viewerId);

  const stats = new Map(
    users.map(u => [
      Number(u.id),
      { subjects: new Set(), contributions: 0 }
    ])
  );

  for (const row of rows) {
    const stat = stats.get(Number(row.user_id));
    if (!stat) continue;

    stat.contributions++;

    if (row.subject_id !== null) {
      stat.subjects.add(row.subject_id);
    }
  }

  return users.map(u => {
    const stat = stats.get(Number(u.id));

    return {
      id: u.pid,
      name: u.name,
      accountType: levelLabel(u.account_type ?? u.level) ?? 'Junior',
      branch: u.branch ?? u.department,
      year: yearLabel(u.semester),
      semester: u.semester,
      subjects: [...stat.subjects].sort(),
      contributions: stat.contributions,
      bio: u.bio,
      available: !!u.available
    };
  });
};

export const contributorDto = u => ({
  id: u.pid,
  name: u.public_profile ? u.name : 'Hidden',
  level: levelLabel(u.account_type ?? u.level) ?? 'Junior',
  branch: u.public_profile ? (u.branch ?? u.department) : '',
  public: !!u.public_profile
});

