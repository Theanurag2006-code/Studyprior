#!/usr/bin/env node
/**
 * Read-only SQLite schema, integrity and query-plan audit for StudyPrior.
 * Does not run migrations, create indexes, or modify records.
 * Node 22.13+; DB_PATH may point to the isolated performance database.
 */
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDir, '..');
const defaultDb = resolve(serverRoot, 'data', 'studyprior.db');
const dbPath = process.env.DB_PATH
  ? (isAbsolute(process.env.DB_PATH) ? process.env.DB_PATH : resolve(process.cwd(), process.env.DB_PATH))
  : defaultDb;
if (!existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  console.error('Set DB_PATH to an existing SQLite database. This audit never creates one.');
  process.exit(1);
}

let db;
try { db = new DatabaseSync(dbPath, { readOnly: true }); }
catch (error) {
  console.error(`Could not open database read-only: ${error.message}`);
  process.exit(1);
}
const rows = (sql, ...args) => db.prepare(sql).all(...args);
const value = sql => db.prepare(sql).get();
const tables = rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(x => x.name);
const indexes = [];
for (const table of tables) {
  const escapedTable = table.replaceAll('"', '""');
  for (const idx of rows(`PRAGMA index_list("${escapedTable}")`)) {
    const escapedIndex = String(idx.name).replaceAll('"', '""');
    const cols = rows(`PRAGMA index_info("${escapedIndex}")`).map(c => c.name);
    indexes.push({ table, name: idx.name, unique: Boolean(idx.unique), origin: idx.origin, columns: cols });
  }
}

const plans = [];
const plan = (name, sql, params = []) => {
  try {
    plans.push({ name, rows: rows(`EXPLAIN QUERY PLAN ${sql}`, ...params).map(x => ({ id: x.id, parent: x.parent, detail: x.detail })) });
  } catch (error) { plans.push({ name, error: error.message, rows: [] }); }
};
plan('Conversation list (OR filter + newest first)',
  'SELECT * FROM conversations WHERE a_id = ? OR b_id = ? ORDER BY last_at DESC', [1, 1]);
plan('Recent messages for one conversation',
  'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 100', ['audit-conversation-id']);
plan('Ratings for one topic',
  'SELECT importance, difficulty, exam, interview FROM ratings WHERE topic_id = ?', ['audit-topic-id']);
plan('Notifications for one user, newest first',
  'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', [1]);
plan('Activity timeline for one user',
  'SELECT * FROM activity WHERE user_id = ? ORDER BY day DESC LIMIT 100', [1]);

const integrity = rows('PRAGMA integrity_check').map(x => x.integrity_check);
const fkIssues = rows('PRAGMA foreign_key_check').slice(0, 50);
const tableCounts = {};
for (const table of tables) {
  const escaped = table.replaceAll('"', '""');
  try { tableCounts[table] = value(`SELECT COUNT(*) AS count FROM "${escaped}"`).count; }
  catch { tableCounts[table] = null; }
}
const result = {
  generatedAt: new Date().toISOString(),
  database: dbPath,
  readOnly: true,
  userVersion: value('PRAGMA user_version').user_version,
  journalMode: value('PRAGMA journal_mode').journal_mode,
  integrityCheck: integrity,
  foreignKeyIssues: fkIssues,
  tableCounts,
  indexes,
  queryPlans: plans,
  recommendations: [],
};
const conversationsPlan = plans.find(x => x.name.startsWith('Conversation list'));
const convText = (conversationsPlan?.rows ?? []).map(x => x.detail).join(' | ').toUpperCase();
if (convText.includes('SCAN CONVERSATIONS') || convText.includes('TEMP B-TREE')) {
  result.recommendations.push('Conversation-list query may scan/sort. Evaluate composite indexes on conversations(a_id, last_at DESC) and conversations(b_id, last_at DESC) on a disposable copy, then compare EXPLAIN QUERY PLAN and repeat API benchmarks before adding a versioned migration.');
}
if (integrity.length !== 1 || integrity[0] !== 'ok') result.recommendations.push('Investigate the integrity_check output before submission.');
if (fkIssues.length) result.recommendations.push('Investigate foreign_key_check rows before submission.');
if (!result.recommendations.length) result.recommendations.push('No obvious issues identified by this limited audit. Review all route-specific queries and real workload before declaring database optimization complete.');

db.close();
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = resolve(serverRoot, 'data', 'performance', 'reports');
mkdirSync(outputDir, { recursive: true });
const jsonPath = resolve(outputDir, `db-audit-${timestamp}.json`);
writeFileSync(jsonPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(`\nSaved audit: ${jsonPath}`);
