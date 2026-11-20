#!/usr/bin/env node
/**
 * Safely evaluates candidate conversation-list indexes and a query rewrite.
 * The source database is opened read-only. VACUUM INTO creates a disposable
 * copy, and all candidate indexes are created only in that temporary copy.
 *
 * Usage:
 *   node server/scripts/perf-conversation-index-check.mjs
 *   node server/scripts/perf-conversation-index-check.mjs /path/to/studyprior-perf.db
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync } from 'node:sqlite';

const sourcePath = path.resolve(
  process.argv[2] || process.env.DB_PATH || 'server/data/performance/studyprior-perf.db'
);
const repeats = Number(process.env.CHECK_REPEATS || 250);
const warmups = Number(process.env.CHECK_WARMUPS || 25);

function quoteSqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Number(sorted[index].toFixed(3));
}

function summarize(values, rowCount) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    iterations: values.length,
    rowsPerCall: rowCount,
    averageMs: Number((total / values.length).toFixed(3)),
    medianMs: percentile(values, 50),
    p95Ms: percentile(values, 95),
    maxMs: Number(Math.max(...values).toFixed(3)),
  };
}

function explain(db, sql, params) {
  return db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params).map((row) => ({
    id: row.id,
    parent: row.parent,
    detail: row.detail,
  }));
}

function runBenchmark(db, sql, params) {
  const statement = db.prepare(sql);
  let rowCount = 0;
  for (let i = 0; i < warmups; i += 1) rowCount = statement.all(...params).length;
  const durations = [];
  for (let i = 0; i < repeats; i += 1) {
    const start = performance.now();
    rowCount = statement.all(...params).length;
    durations.push(performance.now() - start);
  }
  return summarize(durations, rowCount);
}

function idsFor(db, sql, params) {
  return db.prepare(sql).all(...params).map((row) => String(row.id)).sort();
}

if (!fs.existsSync(sourcePath)) {
  console.error(`Database not found: ${sourcePath}`);
  console.error('Pass the performance database path or set DB_PATH.');
  process.exit(1);
}
if (!Number.isInteger(repeats) || repeats < 50 || !Number.isInteger(warmups) || warmups < 0) {
  console.error('CHECK_REPEATS must be an integer >= 50 and CHECK_WARMUPS an integer >= 0.');
  process.exit(1);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studyprior-conversation-index-'));
const copyPath = path.join(tempDir, 'studyprior-index-test.sqlite');
let sourceDb;
let db;
let report;

try {
  sourceDb = new DatabaseSync(sourcePath, { readOnly: true });
  sourceDb.exec(`VACUUM main INTO ${quoteSqlString(copyPath)}`);
  sourceDb.close();
  sourceDb = undefined;

  db = new DatabaseSync(copyPath);
  const columns = db.prepare("PRAGMA table_info('conversations')").all().map((row) => row.name);
  for (const required of ['id', 'a_id', 'b_id', 'last_at']) {
    if (!columns.includes(required)) throw new Error(`Expected conversations.${required}; found columns: ${columns.join(', ')}`);
  }

  const conversationCount = db.prepare('SELECT COUNT(*) AS n FROM conversations').get().n;
  if (conversationCount === 0) throw new Error('The conversations table is empty; no query comparison is possible.');
  const busiest = db.prepare(`
    SELECT user_id, COUNT(*) AS total
    FROM (
      SELECT a_id AS user_id FROM conversations
      UNION ALL
      SELECT b_id AS user_id FROM conversations
    )
    GROUP BY user_id
    ORDER BY total DESC
    LIMIT 1
  `).get();
  const userId = busiest.user_id;

  const originalSql = 'SELECT * FROM conversations WHERE a_id = ? OR b_id = ? ORDER BY last_at DESC';
  const splitSql = `
    SELECT * FROM conversations WHERE a_id = ?
    UNION ALL
    SELECT * FROM conversations WHERE b_id = ? AND a_id <> ?
    ORDER BY last_at DESC
  `;
  const originalParams = [userId, userId];
  const splitParams = [userId, userId, userId];
  const baseIds = idsFor(db, originalSql, originalParams);
  const splitIds = idsFor(db, splitSql, splitParams);
  const equivalent = JSON.stringify(baseIds) === JSON.stringify(splitIds);

  const originalPlanBefore = explain(db, originalSql, originalParams);
  const originalTimingBefore = runBenchmark(db, originalSql, originalParams);

  db.exec('CREATE INDEX ix_perf_conversations_a_last ON conversations(a_id, last_at DESC)');
  db.exec('CREATE INDEX ix_perf_conversations_b_last ON conversations(b_id, last_at DESC)');

  const originalPlanAfter = explain(db, originalSql, originalParams);
  const originalTimingAfter = runBenchmark(db, originalSql, originalParams);
  const splitPlanAfter = explain(db, splitSql, splitParams);
  const splitTimingAfter = runBenchmark(db, splitSql, splitParams);

  report = {
    generatedAt: new Date().toISOString(),
    sourceDatabase: sourcePath,
    sourceDatabaseModified: false,
    candidateIndexesCreatedOnlyInDisposableCopy: [
      'ix_perf_conversations_a_last ON conversations(a_id, last_at DESC)',
      'ix_perf_conversations_b_last ON conversations(b_id, last_at DESC)',
    ],
    disposableCopyRemovedAfterRun: true,
    conversationCount,
    selectedTestUserConversationCount: baseIds.length,
    selectedUserId: String(userId),
    queryEquivalence: {
      originalAndSplitQueryReturnSameConversationIds: equivalent,
      originalRows: baseIds.length,
      splitRows: splitIds.length,
    },
    benchmarkSettings: { warmups, repeats },
    plans: {
      originalBeforeCandidateIndexes: originalPlanBefore,
      originalAfterCandidateIndexes: originalPlanAfter,
      splitQueryAfterCandidateIndexes: splitPlanAfter,
    },
    timings: {
      originalBeforeCandidateIndexes: originalTimingBefore,
      originalAfterCandidateIndexes: originalTimingAfter,
      splitQueryAfterCandidateIndexes: splitTimingAfter,
    },
    note: 'Microbenchmark on one selected high-participation user in a disposable copy. Repeat under representative production-like conditions before adopting a migration.',
  };
} finally {
  if (db) db.close();
  if (sourceDb) sourceDb.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const reportDir = path.resolve('server/data/performance/reports');
fs.mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-');
const jsonPath = path.join(reportDir, `conversation-index-check-${stamp}.json`);
const mdPath = path.join(reportDir, `conversation-index-check-${stamp}.md`);
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const planLines = (rows) => rows.map((row) => `- ${row.detail}`).join('\n') || '- (no plan rows)';
const markdown = `# StudyPrior Conversation Index Experiment\n\n` +
  `- Generated: ${report.generatedAt}\n- Source DB: \`${report.sourceDatabase}\`\n` +
  `- Source database modified: **No**\n- Conversations: ${report.conversationCount}\n` +
  `- Test user conversation rows: ${report.selectedTestUserConversationCount}\n` +
  `- Warm-ups / measured iterations per case: ${warmups} / ${repeats}\n\n` +
  `## Query equivalence\n\n` +
  `Original and split query return identical conversation IDs: **${report.queryEquivalence.originalAndSplitQueryReturnSameConversationIds ? 'Yes' : 'No'}**\n\n` +
  `## Timing comparison\n\n| Variant | Average | Median | P95 | Max | Rows/call |\n|---|---:|---:|---:|---:|---:|\n` +
  `| Original query, before candidate indexes | ${report.timings.originalBeforeCandidateIndexes.averageMs} ms | ${report.timings.originalBeforeCandidateIndexes.medianMs} ms | ${report.timings.originalBeforeCandidateIndexes.p95Ms} ms | ${report.timings.originalBeforeCandidateIndexes.maxMs} ms | ${report.timings.originalBeforeCandidateIndexes.rowsPerCall} |\n` +
  `| Original query, with candidate indexes | ${report.timings.originalAfterCandidateIndexes.averageMs} ms | ${report.timings.originalAfterCandidateIndexes.medianMs} ms | ${report.timings.originalAfterCandidateIndexes.p95Ms} ms | ${report.timings.originalAfterCandidateIndexes.maxMs} ms | ${report.timings.originalAfterCandidateIndexes.rowsPerCall} |\n` +
  `| Split query, with candidate indexes | ${report.timings.splitQueryAfterCandidateIndexes.averageMs} ms | ${report.timings.splitQueryAfterCandidateIndexes.medianMs} ms | ${report.timings.splitQueryAfterCandidateIndexes.p95Ms} ms | ${report.timings.splitQueryAfterCandidateIndexes.maxMs} ms | ${report.timings.splitQueryAfterCandidateIndexes.rowsPerCall} |\n\n` +
  `## Query plans\n\n### Original query before candidate indexes\n${planLines(report.plans.originalBeforeCandidateIndexes)}\n\n` +
  `### Original query after candidate indexes\n${planLines(report.plans.originalAfterCandidateIndexes)}\n\n` +
  `### Split query after candidate indexes\n${planLines(report.plans.splitQueryAfterCandidateIndexes)}\n\n` +
  `## Interpretation\n\nThis is an experiment only. Candidate indexes were created in a temporary database copy and removed after the run. Do not add them to the application schema unless the query plans and repeated timings show a stable improvement, and the updated query has passed the full backend test suite. The test measures SQLite query execution for one selected high-participation user, not end-to-end HTTP latency.\n`;
fs.writeFileSync(mdPath, markdown);

console.log(JSON.stringify(report, null, 2));
console.log(`\nSaved JSON: ${jsonPath}`);
console.log(`Saved Markdown: ${mdPath}`);
