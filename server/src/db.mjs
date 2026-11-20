import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Schema version 1. Extra rules live in the database itself (CHECKs, UNIQUEs, foreign keys) so no bug in the code can break them.
const MIGRATIONS = [`
CREATE TABLE users (
  id INTEGER PRIMARY KEY, pid TEXT NOT NULL UNIQUE, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE CHECK (email = lower(trim(email))), pw_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STUDENT' CHECK (role IN ('STUDENT','ADMIN')),
  department TEXT NOT NULL, branch TEXT, college TEXT NOT NULL, enrollment_number TEXT,
  enrollment_year INTEGER, graduation_year INTEGER, semester INTEGER, level TEXT CHECK (level IN ('JUNIOR','SENIOR')),
  bio TEXT NOT NULL DEFAULT '', available INTEGER NOT NULL DEFAULT 0, public_profile INTEGER NOT NULL DEFAULT 1, theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light','dark')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK ((role = 'STUDENT' AND level IS NOT NULL AND semester IS NOT NULL AND enrollment_year IS NOT NULL AND graduation_year IS NOT NULL) OR (role = 'ADMIN' AND level IS NULL AND semester IS NULL AND enrollment_year IS NULL AND graduation_year IS NULL))
);
CREATE TABLE academic_settings (id INTEGER PRIMARY KEY CHECK (id = 1), junior_max_semester INTEGER NOT NULL, max_semester INTEGER NOT NULL CHECK (junior_max_semester >= 1 AND junior_max_semester < max_semester));
INSERT INTO academic_settings VALUES (1, 4, 8);
CREATE TABLE sessions (id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX ix_sessions_user ON sessions(user_id);
CREATE TABLE reset_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
CREATE TABLE subjects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, name_norm TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', department TEXT NOT NULL, semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 12), code TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL, status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED','PENDING_REVIEW')), created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (name_norm, department, semester)
);
CREATE TABLE units (id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, name TEXT NOT NULL, name_norm TEXT NOT NULL, unit_number INTEGER NOT NULL, UNIQUE (subject_id, unit_number), UNIQUE (subject_id, name_norm));
CREATE TABLE topics (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE, name TEXT NOT NULL, name_norm TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', hours REAL CHECK (hours IS NULL OR (hours >= 0.5 AND hours <= 200)), created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE (subject_id, name_norm)
);
CREATE TABLE user_subjects (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE, PRIMARY KEY (user_id, subject_id));
CREATE TABLE saved_topics (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, PRIMARY KEY (user_id, topic_id));
CREATE TABLE ratings (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  importance INTEGER NOT NULL CHECK (importance BETWEEN 1 AND 5), difficulty INTEGER NOT NULL CHECK (difficulty BETWEEN 1 AND 5), exam INTEGER NOT NULL CHECK (exam BETWEEN 1 AND 5), interview INTEGER NOT NULL CHECK (interview BETWEEN 1 AND 5),
  advice TEXT NOT NULL DEFAULT '', mistakes TEXT NOT NULL DEFAULT '', level TEXT NOT NULL CHECK (level IN ('JUNIOR','SENIOR')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (user_id, topic_id)
);
CREATE INDEX ix_ratings_topic ON ratings(topic_id);
CREATE TABLE plans (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE, target_date TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 5 AND 600), status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED')),
  purpose TEXT CHECK (purpose IN ('EXAMS','HIGHER_STUDIES','CONCEPTUAL','INTERVIEW','REVISION','PROJECTS','PERSONAL','OTHER')), custom_purpose TEXT, completed_at TEXT, created_at TEXT NOT NULL,
  CHECK ((purpose = 'OTHER' AND custom_purpose IS NOT NULL AND trim(custom_purpose) <> '') OR (purpose IS NOT 'OTHER' AND custom_purpose IS NULL))
);
CREATE INDEX ix_plans_user ON plans(user_id);
CREATE TABLE activity (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL, kind TEXT NOT NULL, minutes INTEGER NOT NULL, day TEXT NOT NULL, UNIQUE (plan_id, kind));
CREATE INDEX ix_activity_user ON activity(user_id, day);
CREATE TABLE notes (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL, subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL, topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL, plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE INDEX ix_notes_user ON notes(user_id);
CREATE TABLE drafts (id TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (user_id, id));
CREATE TABLE notifications (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, text TEXT NOT NULL, link TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, ref TEXT);
CREATE INDEX ix_notifications_user ON notifications(user_id, created_at);
CREATE TABLE conversations (id TEXT PRIMARY KEY, a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, last_at TEXT NOT NULL, CHECK (a_id <> b_id), UNIQUE (a_id, b_id));
CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000), created_at TEXT NOT NULL, read_at TEXT);
CREATE INDEX ix_messages_conv ON messages(conversation_id, created_at);
CREATE TABLE blocks (blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, PRIMARY KEY (blocker_id, blocked_id), CHECK (blocker_id <> blocked_id));
CREATE TABLE reports (id TEXT PRIMARY KEY, reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK (kind IN ('message','rating')), target_id TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED')), created_at TEXT NOT NULL, resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL, resolved_at TEXT, UNIQUE (reporter_id, kind, target_id));
`, `
-- v2: idempotent, persisted helpful votes for public academic contributions.
CREATE TABLE contribution_votes (
  id TEXT PRIMARY KEY,
  contribution_type TEXT NOT NULL CHECK (contribution_type IN ('subject','topic','rating')),
  contribution_id TEXT NOT NULL,
  voter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (contribution_type, contribution_id, voter_id)
);
CREATE INDEX ix_contribution_votes_target ON contribution_votes(contribution_type, contribution_id);
CREATE INDEX ix_contribution_votes_voter ON contribution_votes(voter_id, created_at);
`, `
-- v3: persistent, subject-scoped relationships for the topic graph.
CREATE TABLE topic_relationships (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  source_topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  target_topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('PREREQUISITE','RELATED')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  CHECK (source_topic_id <> target_topic_id),
  UNIQUE (source_topic_id, target_topic_id, relationship_type)
);
CREATE INDEX ix_topic_relationships_subject ON topic_relationships(subject_id, relationship_type);
CREATE INDEX ix_topic_relationships_source ON topic_relationships(source_topic_id);
CREATE INDEX ix_topic_relationships_target ON topic_relationships(target_topic_id);
`, `
-- v4: store the user-selected account category independently from semester; add opt-in group ask threads.
ALTER TABLE users ADD COLUMN account_type TEXT CHECK (account_type IN ('JUNIOR','SENIOR','CANDIDATE'));
ALTER TABLE users ADD COLUMN account_type_selected INTEGER NOT NULL DEFAULT 0 CHECK (account_type_selected IN (0,1));
-- Existing accounts receive a temporary migration value based on the old level field.
-- account_type_selected=0 lets the user confirm/correct this legacy value once in Profile. New registrations always provide account_type directly.
-- The old level column is retained solely for compatibility with its original CHECK constraint; it is not the active account category.
UPDATE users SET account_type = CASE WHEN level = 'SENIOR' THEN 'SENIOR' ELSE 'JUNIOR' END WHERE role = 'STUDENT';
ALTER TABLE ratings ADD COLUMN account_type TEXT CHECK (account_type IN ('JUNIOR','SENIOR','CANDIDATE'));
UPDATE ratings SET account_type = CASE WHEN level = 'SENIOR' THEN 'SENIOR' ELSE 'JUNIOR' END;
CREATE TABLE ask_groups (
  id TEXT PRIMARY KEY, asker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, question TEXT NOT NULL CHECK (length(question) BETWEEN 1 AND 1000), created_at TEXT NOT NULL, last_at TEXT NOT NULL, closed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE ask_group_members (
  group_id TEXT NOT NULL REFERENCES ask_groups(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, member_type TEXT NOT NULL CHECK (member_type IN ('ASKER','HELPER')), joined_at TEXT NOT NULL, last_read_at TEXT, PRIMARY KEY (group_id, user_id)
);
CREATE INDEX ix_ask_group_members_user ON ask_group_members(user_id, group_id);
CREATE TABLE ask_group_messages (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES ask_groups(id) ON DELETE CASCADE, sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000), created_at TEXT NOT NULL
);
CREATE INDEX ix_ask_group_messages_group ON ask_group_messages(group_id, created_at);
`, `
-- v5: delivery receipts for direct and shared messages.
ALTER TABLE messages ADD COLUMN delivered_at TEXT;
CREATE TABLE ask_group_message_receipts (
  message_id TEXT NOT NULL REFERENCES ask_group_messages(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivered_at TEXT,
  read_at TEXT,
  PRIMARY KEY (message_id, recipient_id)
);
CREATE INDEX ix_ask_group_receipts_recipient ON ask_group_message_receipts(recipient_id, delivered_at, read_at);
-- Existing read direct messages are known to have been delivered; preserve their strongest known state.
UPDATE messages SET delivered_at = read_at WHERE read_at IS NOT NULL;
-- Backfill receipt rows for existing shared discussions. A member's last_read_at is sufficient proof of Seen.
INSERT INTO ask_group_message_receipts (message_id, recipient_id, delivered_at, read_at)
SELECT msg.id, member.user_id,
  CASE WHEN member.last_read_at IS NOT NULL AND member.last_read_at >= msg.created_at THEN msg.created_at ELSE NULL END,
  CASE WHEN member.last_read_at IS NOT NULL AND member.last_read_at >= msg.created_at THEN msg.created_at ELSE NULL END
FROM ask_group_messages msg JOIN ask_group_members member ON member.group_id = msg.group_id AND member.user_id <> msg.sender_id;
`];

export function openDb(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path); db.exec('PRAGMA foreign_keys = ON;'); if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  const v = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = v; i < MIGRATIONS.length; i++) { db.exec('BEGIN'); try { db.exec(MIGRATIONS[i]); db.exec(`PRAGMA user_version = ${i + 1}`); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } }
  return db;
}
/** Runs fn inside a transaction: everything succeeds together or nothing is saved. */
export function tx(db, fn) { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }
export const nowIso = () => new Date().toISOString();
export const norm = s => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
export const isUnique = e => /UNIQUE constraint failed/i.test(e?.message ?? '');
