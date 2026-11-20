/**
 * StudyPrior isolated performance-data generator.
 *
 * Run from any directory:
 *   PERF_PASSWORD='PerfTest-only-2026!' PERF_PROFILE=small node server/scripts/perf-seed.mjs
 *
 * Profiles: small | medium | large | stress
 * The database is always server/data/performance/studyprior-perf.db.
 * To regenerate it, stop any API server using this database and set PERF_RESET=YES.
 * This script never opens or deletes data/studyprior.db.
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, newId } from '../src/lib/crypto.mjs';
import { norm, openDb } from '../src/db.mjs';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to generate performance data in production.');
  process.exit(1);
}

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const performanceDir = resolve(serverRoot, 'data', 'performance');
const dbPath = resolve(performanceDir, 'studyprior-perf.db');
if (!dbPath.startsWith(performanceDir + sep)) throw new Error('Unsafe performance database path.');

const profiles = {
  small:  { users: 100,   subjects: 12,  topicsPerUnit: 8,  ratingsPerTopic: 6,  conversations: 60,   messagesPerConversation: 8,  notificationsPerUser: 2, askGroups: 10,  groupSize: 5, plans: 30,   notes: 15,   drafts: 10 },
  medium: { users: 1000,  subjects: 40,  topicsPerUnit: 10, ratingsPerTopic: 10, conversations: 600,  messagesPerConversation: 15, notificationsPerUser: 2, askGroups: 25,  groupSize: 6, plans: 300,  notes: 150,  drafts: 100 },
  large:  { users: 5000,  subjects: 120, topicsPerUnit: 10, ratingsPerTopic: 12, conversations: 3000, messagesPerConversation: 20, notificationsPerUser: 2, askGroups: 100, groupSize: 8, plans: 1500, notes: 750, drafts: 500 },
  stress: { users: 10000, subjects: 250, topicsPerUnit: 12, ratingsPerTopic: 15, conversations: 7000, messagesPerConversation: 25, notificationsPerUser: 3, askGroups: 250, groupSize: 8, plans: 4000, notes: 2000, drafts: 1000 },
};

const profileName = process.env.PERF_PROFILE ?? process.argv[2] ?? 'small';
const profile = profiles[profileName];
if (!profile) {
  console.error(`Unknown PERF_PROFILE '${profileName}'. Choose: ${Object.keys(profiles).join(', ')}`);
  process.exit(1);
}

const password = process.env.PERF_PASSWORD;
if (!password || password.length < 10) {
  console.error("Set PERF_PASSWORD to a test-only password of at least 10 characters.");
  process.exit(1);
}

if (existsSync(dbPath)) {
  if (process.env.PERF_RESET !== 'YES') {
    console.error(`Performance database already exists: ${dbPath}`);
    console.error('Stop any API server using it, then rerun with PERF_RESET=YES to recreate this isolated database.');
    process.exit(1);
  }
  for (const suffix of ['', '-wal', '-shm']) rmSync(dbPath + suffix, { force: true });
}
mkdirSync(dirname(dbPath), { recursive: true });

const startedAt = Date.now();
const passwordHash = await hashPassword(password);
const db = openDb(dbPath);
const now = new Date();
const baseMs = Date.UTC(now.getUTCFullYear() - 2, 0, 1);
const timestamp = n => new Date(baseMs + n * 60_000).toISOString();
const dateOnly = n => timestamp(n).slice(0, 10);
const pick = (arr, n) => arr[n % arr.length];
const departments = ['Computer Science', 'Information Technology', 'Electronics', 'Mechanical Engineering', 'Electrical Engineering'];
const advice = [
  'Revise the core definitions and solve a few representative problems.',
  'Work through a small example before attempting the full problem.',
  'Compare the common approaches and note when each is useful.',
  'Practice explaining the concept in your own words.',
];
const purposes = ['EXAMS', 'HIGHER_STUDIES', 'CONCEPTUAL', 'INTERVIEW', 'REVISION', 'PROJECTS', 'PERSONAL', 'OTHER'];
const students = [];
const subjectRows = [];
const topicRows = [];
const ratingIds = [];
const messageIds = [];
const planRows = [];
const adminEmail = 'perf-admin@load.studyprior.test';
const currentYear = now.getUTCFullYear();
const t0 = db.prepare(`INSERT INTO users
  (pid, name, email, pw_hash, role, department, branch, college, enrollment_year, graduation_year, semester, level, account_type, account_type_selected, bio, available, public_profile)
  VALUES (?, ?, ?, ?, 'STUDENT', ?, ?, 'StudyPrior Synthetic University', ?, ?, ?, ?, ?, 1, ?, ?, ?)`);
const adminInsert = db.prepare(`INSERT INTO users
  (pid, name, email, pw_hash, role, department, branch, college, enrollment_year, graduation_year, semester, level, account_type, account_type_selected, bio, available, public_profile)
  VALUES (?, ?, ?, ?, 'ADMIN', 'Administration', NULL, 'StudyPrior Synthetic University', NULL, NULL, NULL, NULL, NULL, 1, '', 0, 0)`);

try {
  db.exec('BEGIN IMMEDIATE');

  // One admin account is included for admin-endpoint testing.
  adminInsert.run('perf-admin', 'Performance Test Admin', adminEmail, passwordHash);

  // Users: all records are synthetic and share the explicitly supplied test password.
  for (let i = 0; i < profile.users; i++) {
    const semester = (i % 8) + 1;
    const accountType = i % 20 < 13 ? 'JUNIOR' : i % 20 < 18 ? 'SENIOR' : 'CANDIDATE';
    const legacyLevel = accountType === 'JUNIOR' ? 'JUNIOR' : 'SENIOR';
    const enrollmentYear = currentYear - Math.ceil(semester / 2) + 1;
    const email = `perf${String(i + 1).padStart(6, '0')}@load.studyprior.test`;
    const result = t0.run(
      `perf-${String(i + 1).padStart(6, '0')}`,
      `Performance Student ${i + 1}`,
      email,
      passwordHash,
      pick(departments, i),
      pick(['Computer Science', 'Information Technology', 'Electronics'], i * 3),
      enrollmentYear,
      enrollmentYear + 4,
      semester,
      legacyLevel,
      accountType,
      `Synthetic ${accountType.toLowerCase()} account for performance testing.`,
      accountType !== 'JUNIOR' && i % 3 === 0 ? 1 : 0,
      i % 5 === 0 ? 0 : 1,
    );
    students.push({ id: Number(result.lastInsertRowid), accountType, legacyLevel, semester });
  }

  // Academic catalog: subject -> units -> topics.
  const insertSubject = db.prepare(`INSERT INTO subjects
    (id, name, name_norm, description, department, semester, code, created_by, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PUBLISHED', ?)`);
  const insertUnit = db.prepare(`INSERT INTO units (id, subject_id, name, name_norm, unit_number) VALUES (?, ?, ?, ?, ?)`);
  const insertTopic = db.prepare(`INSERT INTO topics
    (id, subject_id, unit_id, name, name_norm, description, hours, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (let s = 0; s < profile.subjects; s++) {
    const subjectId = newId();
    const subjectName = `Performance Subject ${String(s + 1).padStart(4, '0')}`;
    const department = pick(departments, s);
    const semester = (s % 8) + 1;
    const owner = students[s % students.length];
    insertSubject.run(subjectId, subjectName, norm(subjectName), 'Synthetic subject for repeatable performance tests.', department, semester, `PERF${String(s + 1).padStart(4, '0')}`, owner.id, timestamp(s));
    const subjectTopics = [];
    for (let u = 1; u <= 4; u++) {
      const unitId = newId();
      const unitName = `Unit ${u}`;
      insertUnit.run(unitId, subjectId, unitName, norm(unitName), u);
      for (let k = 1; k <= profile.topicsPerUnit; k++) {
        const topicId = newId();
        const topicName = `${subjectName} U${u} Topic ${String(k).padStart(2, '0')}`;
        insertTopic.run(topicId, subjectId, unitId, topicName, norm(topicName), 'Synthetic topic generated for scale testing.', 1 + (k % 8), owner.id, timestamp(s * 100 + u * 10 + k));
        const item = { id: topicId, subjectId, ownerId: owner.id };
        subjectTopics.push(item);
        topicRows.push(item);
      }
    }
    subjectRows.push({ id: subjectId, ownerId: owner.id, topics: subjectTopics });
  }

  // Ratings: deterministic raters, with one rating per user/topic as required by the schema.
  const insertRating = db.prepare(`INSERT INTO ratings
    (id, user_id, topic_id, importance, difficulty, exam, interview, advice, mistakes, level, created_at, updated_at, account_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let ti = 0; ti < topicRows.length; ti++) {
    const topic = topicRows[ti];
    for (let r = 0; r < profile.ratingsPerTopic; r++) {
      const user = students[(ti * 17 + r * 7919) % students.length];
      const level = user.accountType === 'JUNIOR' ? 'JUNIOR' : 'SENIOR';
      const base = 1 + ((ti + r) % 5);
      const id = newId();
      insertRating.run(id, user.id, topic.id, base, 1 + ((ti + r * 2) % 5), 1 + ((ti * 2 + r) % 5), 1 + ((ti + r * 3) % 5), pick(advice, ti + r), '', level, timestamp(ti * 10 + r), timestamp(ti * 10 + r + 1), user.accountType);
      ratingIds.push({ id, userId: user.id });
    }
  }

  // Student-subject membership and personal saved-topic lists.
  const insertUserSubject = db.prepare('INSERT OR IGNORE INTO user_subjects (user_id, subject_id) VALUES (?, ?)');
  const insertSaved = db.prepare('INSERT OR IGNORE INTO saved_topics (user_id, topic_id) VALUES (?, ?)');
  for (let i = 0; i < students.length; i++) {
    for (let j = 0; j < 3; j++) insertUserSubject.run(students[i].id, subjectRows[(i * 7 + j * 11) % subjectRows.length].id);
    for (let j = 0; j < 2; j++) insertSaved.run(students[i].id, topicRows[(i * 13 + j * 37) % topicRows.length].id);
  }

  // Topic relationships: two edges per subject where enough topics exist.
  const insertRelationship = db.prepare(`INSERT INTO topic_relationships
    (id, subject_id, source_topic_id, target_topic_id, relationship_type, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (const subject of subjectRows) {
    if (subject.topics.length >= 2) insertRelationship.run(newId(), subject.id, subject.topics[0].id, subject.topics[1].id, 'RELATED', subject.ownerId, timestamp(subject.topics.length));
    if (subject.topics.length >= 3) insertRelationship.run(newId(), subject.id, subject.topics[1].id, subject.topics[2].id, 'PREREQUISITE', subject.ownerId, timestamp(subject.topics.length + 1));
  }

  // Direct conversations and messages. Pairs are unique and normalized (a_id < b_id).
  const insertConversation = db.prepare('INSERT INTO conversations (id, a_id, b_id, created_at, last_at) VALUES (?, ?, ?, ?, ?)');
  const insertMessage = db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, created_at, read_at, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < profile.conversations; i++) {
    const a = students[i];
    const b = students[i + 1];
    const conversationId = newId();
    const firstAt = timestamp(500_000 + i * profile.messagesPerConversation);
    const lastAt = timestamp(500_000 + i * profile.messagesPerConversation + profile.messagesPerConversation - 1);
    insertConversation.run(conversationId, a.id, b.id, firstAt, lastAt);
    for (let m = 0; m < profile.messagesPerConversation; m++) {
      const sender = m % 2 === 0 ? a : b;
      const at = timestamp(500_000 + i * profile.messagesPerConversation + m);
      const deliveredAt = m % 5 === 0 ? null : at;
      const readAt = m % 3 === 0 ? null : at;
      const id = newId();
      insertMessage.run(id, conversationId, sender.id, `Synthetic performance message ${m + 1} in conversation ${i + 1}.`, at, readAt, readAt ? deliveredAt ?? at : deliveredAt);
      messageIds.push(id);
    }
  }

  // Notifications per student.
  const insertNotification = db.prepare(`INSERT INTO notifications (id, user_id, text, link, read, created_at, ref)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < students.length; i++) {
    for (let n = 0; n < profile.notificationsPerUser; n++) {
      insertNotification.run(newId(), students[i].id, `Synthetic notification ${n + 1}`, '/catalog', n % 2, timestamp(700_000 + i * profile.notificationsPerUser + n), `perf-notification-${i}-${n}`);
    }
  }

  // Ask Everyone groups, memberships, group messages and per-recipient delivery receipts.
  const insertGroup = db.prepare('INSERT INTO ask_groups (id, asker_id, question, created_at, last_at, closed) VALUES (?, ?, ?, ?, ?, 0)');
  const insertMember = db.prepare('INSERT INTO ask_group_members (group_id, user_id, member_type, joined_at, last_read_at) VALUES (?, ?, ?, ?, ?)');
  const insertGroupMessage = db.prepare('INSERT INTO ask_group_messages (id, group_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)');
  const insertReceipt = db.prepare('INSERT INTO ask_group_message_receipts (message_id, recipient_id, delivered_at, read_at) VALUES (?, ?, ?, ?)');
  const groupMessageCount = 8;
  for (let g = 0; g < profile.askGroups; g++) {
    const groupId = newId();
    const members = [];
    for (let j = 0; j < profile.groupSize; j++) members.push(students[(g * profile.groupSize + j * 3) % students.length]);
    const asker = members[0];
    const groupStart = 800_000 + g * groupMessageCount;
    insertGroup.run(groupId, asker.id, `Synthetic group question ${g + 1}: explain this academic concept.`, timestamp(groupStart), timestamp(groupStart + groupMessageCount - 1));
    for (let j = 0; j < members.length; j++) insertMember.run(groupId, members[j].id, j === 0 ? 'ASKER' : 'HELPER', timestamp(groupStart), j % 2 === 0 ? timestamp(groupStart + 2) : null);
    for (let m = 0; m < groupMessageCount; m++) {
      const sender = members[m % members.length];
      const at = timestamp(groupStart + m);
      const messageId = newId();
      insertGroupMessage.run(messageId, groupId, sender.id, `Synthetic shared discussion message ${m + 1}.`, at);
      for (const recipient of members) {
        if (recipient.id === sender.id) continue;
        const readAt = (m + recipient.id) % 3 === 0 ? at : null;
        insertReceipt.run(messageId, recipient.id, at, readAt);
      }
    }
  }

  // Planner, activity, notes and drafts.
  const insertPlan = db.prepare(`INSERT INTO plans
    (id, user_id, topic_id, target_date, minutes, status, purpose, custom_purpose, completed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertActivity = db.prepare('INSERT INTO activity (id, user_id, plan_id, kind, minutes, day) VALUES (?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < profile.plans; i++) {
    const user = students[i % students.length];
    const topic = topicRows[(i * 19) % topicRows.length];
    const status = i % 3 === 0 ? 'COMPLETED' : i % 3 === 1 ? 'IN_PROGRESS' : 'PLANNED';
    const purpose = pick(purposes, i);
    const createdAt = timestamp(900_000 + i);
    const completedAt = status === 'COMPLETED' ? timestamp(900_001 + i) : null;
    const customPurpose = purpose === 'OTHER' ? 'Personal skill development' : null;
    const plan = { id: newId(), user, topic };
    insertPlan.run(plan.id, user.id, topic.id, dateOnly(900_100 + i), 25 + (i % 8) * 10, status, purpose, customPurpose, completedAt, createdAt);
    planRows.push(plan);
    if (status === 'COMPLETED') insertActivity.run(newId(), user.id, plan.id, 'STUDY', 25 + (i % 8) * 10, dateOnly(900_001 + i));
  }

  const insertNote = db.prepare(`INSERT INTO notes
    (id, user_id, title, body, subject_id, topic_id, plan_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < profile.notes; i++) {
    const user = students[i % students.length];
    const subject = subjectRows[i % subjectRows.length];
    const topic = subject.topics[i % subject.topics.length];
    const plan = planRows.length ? planRows[i % planRows.length] : null;
    const at = timestamp(950_000 + i);
    insertNote.run(newId(), user.id, `Performance note ${i + 1}`, 'Synthetic note body for database and API performance testing.', subject.id, topic.id, plan?.id ?? null, at, at);
  }
  const insertDraft = db.prepare('INSERT INTO drafts (id, user_id, data, updated_at) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < profile.drafts; i++) {
    const user = students[i % students.length];
    insertDraft.run(`perf-draft-${i + 1}`, user.id, JSON.stringify({ title: `Draft ${i + 1}`, subjectId: subjectRows[i % subjectRows.length].id, body: 'Synthetic draft for performance testing.' }), timestamp(960_000 + i));
  }

  // Blocking and reporting records for moderation/security-path load tests.
  const insertBlock = db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)');
  for (let i = 0; i + 1 < students.length; i += 100) insertBlock.run(students[i].id, students[i + 1].id, timestamp(970_000 + i));
  const insertReport = db.prepare(`INSERT INTO reports (id, reporter_id, kind, target_id, reason, status, created_at, resolved_by, resolved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const reportCount = Math.min(Math.floor(profile.users / 20), Math.max(1, messageIds.length));
  for (let i = 0; i < reportCount; i++) {
    const resolved = i % 4 === 0;
    insertReport.run(newId(), students[i % students.length].id, 'message', messageIds[i], 'Synthetic report for moderation-path testing.', resolved ? 'RESOLVED' : 'OPEN', timestamp(980_000 + i), resolved ? 1 : null, resolved ? timestamp(980_001 + i) : null);
  }

  // Helpful votes are synthetic and intentionally use real subject/topic/rating identifiers.
  const insertVote = db.prepare(`INSERT OR IGNORE INTO contribution_votes
    (id, contribution_type, contribution_id, voter_id, created_at) VALUES (?, ?, ?, ?, ?)`);
  for (let i = 0; i < Math.min(profile.users, topicRows.length); i++) {
    const voter = students[i];
    const topic = topicRows[(i * 7) % topicRows.length];
    const subject = subjectRows[i % subjectRows.length];
    if (voter.id !== topic.ownerId) insertVote.run(newId(), 'topic', topic.id, voter.id, timestamp(990_000 + i));
    if (voter.id !== subject.ownerId) insertVote.run(newId(), 'subject', subject.id, voter.id, timestamp(990_500 + i));
    const rating = ratingIds[(i * 11) % ratingIds.length];
    if (rating && voter.id !== rating.userId) insertVote.run(newId(), 'rating', rating.id, voter.id, timestamp(991_000 + i));
  }

  db.exec('COMMIT');
} catch (error) {
  try { db.exec('ROLLBACK'); } catch { /* transaction may already be closed */ }
  db.close();
  throw error;
}

db.exec('ANALYZE');
const foreignKeyIssues = db.prepare('PRAGMA foreign_key_check').all();
const integrityResult = db.prepare('PRAGMA integrity_check').get().integrity_check;
if (foreignKeyIssues.length || integrityResult !== 'ok') {
  db.close();
  throw new Error(`Generated database failed integrity checks: foreignKeyIssues=${foreignKeyIssues.length}, integrity=${integrityResult}`);
}
const count = table => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const summary = {
  profile: profileName,
  database: dbPath,
  foreignKeyCheck: foreignKeyIssues.length === 0 ? 'ok' : 'failed',
  integrityCheck: integrityResult,
  users: count('users'),
  subjects: count('subjects'),
  units: count('units'),
  topics: count('topics'),
  ratings: count('ratings'),
  userSubjectLinks: count('user_subjects'),
  savedTopics: count('saved_topics'),
  topicRelationships: count('topic_relationships'),
  conversations: count('conversations'),
  directMessages: count('messages'),
  notifications: count('notifications'),
  askGroups: count('ask_groups'),
  groupMessages: count('ask_group_messages'),
  groupReceipts: count('ask_group_message_receipts'),
  plans: count('plans'),
  activity: count('activity'),
  notes: count('notes'),
  drafts: count('drafts'),
  blocks: count('blocks'),
  reports: count('reports'),
  contributionVotes: count('contribution_votes'),
  elapsedSeconds: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
};
db.close();
console.log('\nStudyPrior performance dataset created successfully:');
console.table(summary);
console.log(`\nPerformance admin: ${adminEmail}`);
console.log(`Performance student: perf000001@load.studyprior.test`);
console.log('Both use the PERF_PASSWORD supplied to this run.');
console.log('This dataset is synthetic. It does not modify the normal development database.');
