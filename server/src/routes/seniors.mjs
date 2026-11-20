import { ApiError, forbidden, notFound } from '../lib/errors.mjs';
import { validator } from '../lib/validate.mjs';
import { newId } from '../lib/crypto.mjs';
import { nowIso, tx } from '../db.mjs';
import { q, levelLabel } from '../dto.mjs';
import { notify } from '../services.mjs';
import { HELPER_MIN_SEMESTER, yearLabel } from '../domain/academic.mjs';

const publicSenior = (db, pid) => q.get(db, `SELECT * FROM users WHERE pid = ? AND role = 'STUDENT' AND semester >= ${HELPER_MIN_SEMESTER} AND available = 1`, pid);
const count = (db, sql, ...args) => Number(q.get(db, sql, ...args)?.c ?? 0);

function helpfulCount(db, type, id) {
  return count(db, 'SELECT count(*) c FROM contribution_votes WHERE contribution_type = ? AND contribution_id = ?', type, id);
}
function wasHelpful(db, type, id, voterId) {
  return !!q.get(db, 'SELECT 1 x FROM contribution_votes WHERE contribution_type = ? AND contribution_id = ? AND voter_id = ?', type, id, voterId);
}

function contributionStats(db, senior) {
  const publishedSubjects = count(db, "SELECT count(*) c FROM subjects WHERE created_by = ? AND status = 'PUBLISHED'", senior.id);
  const pendingSubjects = count(db, "SELECT count(*) c FROM subjects WHERE created_by = ? AND status = 'PENDING_REVIEW'", senior.id);
  const submittedSubjects = publishedSubjects + pendingSubjects;
  const publishedTopics = count(db, "SELECT count(*) c FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE t.created_by = ? AND s.status='PUBLISHED'", senior.id);
  const submittedTopics = count(db, 'SELECT count(*) c FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE t.created_by = ?', senior.id);
  const ratingsSubmitted = count(db, `SELECT count(*) c FROM ratings r JOIN topics t ON t.id=r.topic_id JOIN subjects s ON s.id=t.subject_id WHERE r.user_id=? AND s.status='PUBLISHED'`, senior.id);
  const writtenExplanations = count(db, `SELECT count(*) c FROM ratings r JOIN topics t ON t.id=r.topic_id JOIN subjects s ON s.id=t.subject_id WHERE r.user_id=? AND s.status='PUBLISHED' AND (length(trim(r.advice)) > 0 OR length(trim(r.mistakes)) > 0)`, senior.id);
  const helpfulOnSubjects = count(db, "SELECT count(*) c FROM contribution_votes v JOIN subjects s ON v.contribution_type='subject' AND v.contribution_id=s.id WHERE s.created_by = ? AND s.status='PUBLISHED'", senior.id);
  const helpfulOnTopics = count(db, "SELECT count(*) c FROM contribution_votes v JOIN topics t ON v.contribution_type='topic' AND v.contribution_id=t.id JOIN subjects s ON s.id=t.subject_id WHERE t.created_by = ? AND s.status='PUBLISHED'", senior.id);
  const helpfulOnRatings = count(db, "SELECT count(*) c FROM contribution_votes v JOIN ratings r ON v.contribution_type='rating' AND v.contribution_id=r.id JOIN topics t ON t.id=r.topic_id JOIN subjects s ON s.id=t.subject_id WHERE r.user_id = ? AND s.status='PUBLISHED'", senior.id);
  const helpfulVotesReceived = helpfulOnSubjects + helpfulOnTopics + helpfulOnRatings;
  return {
    subjectsSubmitted: submittedSubjects,
    subjectsPublished: publishedSubjects,
    subjectsPending: pendingSubjects,
    topicsSubmitted: submittedTopics,
    topicsPublished: publishedTopics,
    ratingsSubmitted,
    writtenExplanations,
    helpfulVotesReceived,
    totalPublishedContributions: publishedSubjects + publishedTopics + writtenExplanations,
  };
}

function feedItems(db, senior, viewer) {
  const subjects = q.all(db, `SELECT s.id, s.name title, s.description body, s.id subject_id, NULL topic_id, s.created_at, 'subject' type
    FROM subjects s WHERE s.created_by=? AND s.status='PUBLISHED'`, senior.id).map(x => ({ ...x, subtitle: 'Published subject', helpfulCount: helpfulCount(db, 'subject', x.id), isHelpful: wasHelpful(db, 'subject', x.id, viewer.id) }));
  const topics = q.all(db, `SELECT t.id, t.name title, t.description body, s.id subject_id, t.id topic_id, t.created_at, 'topic' type, s.name subject_name
    FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE t.created_by=? AND s.status='PUBLISHED'`, senior.id).map(x => ({ ...x, subtitle: `Topic in ${x.subject_name}`, helpfulCount: helpfulCount(db, 'topic', x.id), isHelpful: wasHelpful(db, 'topic', x.id, viewer.id) }));
  const ratings = q.all(db, `SELECT r.id, 'Advice on ' || t.name title, trim(CASE WHEN length(trim(r.advice)) > 0 THEN r.advice ELSE r.mistakes END) body,
      s.id subject_id, t.id topic_id, r.updated_at created_at, 'rating' type, s.name subject_name, t.name topic_name,
      r.advice, r.mistakes, r.importance, r.difficulty, r.exam, r.interview
    FROM ratings r JOIN topics t ON t.id=r.topic_id JOIN subjects s ON s.id=t.subject_id
    WHERE r.user_id=? AND s.status='PUBLISHED' AND (length(trim(r.advice)) > 0 OR length(trim(r.mistakes)) > 0)`, senior.id).map(x => ({ ...x, subtitle: `Written feedback in ${x.subject_name}`, helpfulCount: helpfulCount(db, 'rating', x.id), isHelpful: wasHelpful(db, 'rating', x.id, viewer.id) }));
  return [...subjects, ...topics, ...ratings]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.title.localeCompare(b.title))
    .map(x => ({ id: x.id, type: x.type, title: x.title, body: x.body ?? '', subtitle: x.subtitle,
      subjectId: x.subject_id, topicId: x.topic_id ?? undefined, subjectName: x.subject_name ?? undefined,
      createdAt: x.created_at, helpfulCount: x.helpfulCount, isHelpful: x.isHelpful,
      ...(x.type === 'rating' ? { advice: x.advice, mistakes: x.mistakes, ratings: { importance: x.importance, difficulty: x.difficulty, exam: x.exam, interview: x.interview } } : {}) }));
}

function profileFor(db, senior, viewer) {
  const contributed = q.all(db, `SELECT DISTINCT s.id, s.name FROM subjects s WHERE s.status='PUBLISHED' AND s.created_by=?
    UNION SELECT DISTINCT s.id, s.name FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE s.status='PUBLISHED' AND t.created_by=?
    ORDER BY name`, senior.id, senior.id);
  const stats = contributionStats(db, senior);
  if (Number(senior.id) !== Number(viewer.id)) {
    // Public statistics only describe public/published work; unpublished submission counts are private to their author.
    stats.subjectsSubmitted = stats.subjectsPublished; stats.subjectsPending = 0; stats.topicsSubmitted = stats.topicsPublished;
  }
  return {
    profile: {
      id: senior.pid, name: senior.name, branch: senior.branch ?? senior.department, department: senior.department,
      college: senior.college, semester: senior.semester, year: yearLabel(senior.semester), graduationYear: senior.graduation_year,
      bio: senior.bio, accountType: levelLabel(senior.account_type ?? senior.level) ?? 'Junior', available: !!senior.available, publicProfile: !!senior.public_profile,
      joined: senior.created_at.slice(0, 10), isOwnProfile: senior.id === viewer.id,
      // Derived from actual published contributions, rather than treating personal saved subjects as expertise.
      subjects: contributed.map(x => ({ id: x.id, name: x.name })),
    },
    stats,
  };
}

function resolveContribution(db, type, id) {
  if (type === 'subject') {
    const row = q.get(db, `SELECT id, created_by author_id, name title FROM subjects WHERE id=? AND status='PUBLISHED' AND created_by IS NOT NULL`, id);
    return row ? { ...row, type } : null;
  }
  if (type === 'topic') {
    const row = q.get(db, `SELECT t.id, t.created_by author_id, t.name title FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE t.id=? AND s.status='PUBLISHED' AND t.created_by IS NOT NULL`, id);
    return row ? { ...row, type } : null;
  }
  if (type === 'rating') {
    const row = q.get(db, `SELECT r.id, r.user_id author_id, 'Written feedback' title FROM ratings r JOIN topics t ON t.id=r.topic_id JOIN subjects s ON s.id=t.subject_id WHERE r.id=? AND s.status='PUBLISHED' AND (length(trim(r.advice))>0 OR length(trim(r.mistakes))>0)`, id);
    return row ? { ...row, type } : null;
  }
  return null;
}

export function register(r) {
  r.add('GET', '/seniors/:pid', { auth: true }, ({ params, db, user }) => {
    const target = publicSenior(db, params.pid);
    if (!target || (!target.public_profile && target.id !== user.id)) throw notFound('This senior profile is not available.');
    return profileFor(db, target, user);
  });

  r.add('GET', '/seniors/:pid/feed', { auth: true }, ({ params, db, user, query }) => {
    const target = publicSenior(db, params.pid);
    if (!target || (!target.public_profile && target.id !== user.id)) throw notFound('This senior feed is not available.');
    const all = feedItems(db, target, user);
    const offset = Math.max(0, Number.parseInt(query.offset ?? '0', 10) || 0);
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit ?? '20', 10) || 20));
    return { items: all.slice(offset, offset + limit), total: all.length, offset, limit, hasMore: offset + limit < all.length };
  });

  r.add('PUT', '/contributions/:type/:id/helpful', { auth: 'student', limit: ['helpful-vote', 3600_000, 300] }, ({ params, db, user, status }) => {
    const type = params.type.toLowerCase();
    if (!['subject', 'topic', 'rating'].includes(type)) throw notFound('Contribution not found.');
    const contribution = resolveContribution(db, type, params.id);
    if (!contribution) throw notFound('Published contribution not found.');
    if (Number(contribution.author_id) === Number(user.id)) throw forbidden('You cannot vote on your own contribution.');
    const added = tx(db, () => {
      const before = q.get(db, 'SELECT 1 x FROM contribution_votes WHERE contribution_type=? AND contribution_id=? AND voter_id=?', type, params.id, user.id);
      q.run(db, 'INSERT OR IGNORE INTO contribution_votes (id, contribution_type, contribution_id, voter_id, created_at) VALUES (?,?,?,?,?)', newId(), type, params.id, user.id, nowIso());
      return !before;
    });
    if (added) {
      const author = q.get(db, 'SELECT id, pid, name FROM users WHERE id=?', contribution.author_id);
      if (author) notify(db, author.id, `${user.name} found your ${type} contribution helpful`, `/seniors/${author.pid}`, `helpful:${type}:${params.id}:${user.id}`);
    }
    status(200); return { helpful: true, helpfulCount: helpfulCount(db, type, params.id), isHelpful: true };
  });

  r.add('DELETE', '/contributions/:type/:id/helpful', { auth: 'student' }, ({ params, db, user }) => {
    const type = params.type.toLowerCase();
    if (!['subject', 'topic', 'rating'].includes(type)) throw notFound('Contribution not found.');
    const contribution = resolveContribution(db, type, params.id);
    if (!contribution) throw notFound('Published contribution not found.');
    if (Number(contribution.author_id) === Number(user.id)) throw forbidden('You cannot vote on your own contribution.');
    q.run(db, 'DELETE FROM contribution_votes WHERE contribution_type=? AND contribution_id=? AND voter_id=?', type, params.id, user.id);
    return { helpful: false, helpfulCount: helpfulCount(db, type, params.id), isHelpful: false };
  });
}
