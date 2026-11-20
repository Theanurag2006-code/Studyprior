#!/usr/bin/env node
/**
 * Repeatable, read-only StudyPrior API load benchmark.
 * Node 22.13+. Uses the existing authenticated benchmark runner.
 * Only permits localhost targets because it is intended for local test data.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(scriptDir, '..');
const projectRoot = resolve(serverRoot, '..');
const benchmarkPath = resolve(scriptDir, 'perf-benchmark-auth-v2.mjs');
const url = process.env.PERF_URL ?? 'http://localhost:4001/api/v1/catalog';
const requests = Number.parseInt(process.env.PERF_REQUESTS ?? '40', 10);
const rounds = Number.parseInt(process.env.PERF_ROUNDS ?? '3', 10);
const warmup = Number.parseInt(process.env.PERF_WARMUP ?? '3', 10);
const concurrencyLevels = (process.env.PERF_CONCURRENCY_LEVELS ?? '5,10')
  .split(',').map(x => Number.parseInt(x.trim(), 10));
const timeoutMs = Number.parseInt(process.env.PERF_TIMEOUT_MS ?? '15000', 10);

function fail(message) { console.error(`\nERROR: ${message}`); process.exit(1); }
if (!existsSync(benchmarkPath)) fail(`Missing benchmark runner: ${benchmarkPath}`);
let target;
try { target = new URL(url); } catch { fail(`Invalid PERF_URL: ${url}`); }
if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(target.hostname)) {
  fail('PERF_URL must point to localhost, 127.0.0.1, or ::1.');
}
if (!Number.isInteger(requests) || requests < 1 || requests > 800) fail('PERF_REQUESTS must be 1–800.');
if (!Number.isInteger(rounds) || rounds < 2 || rounds > 5) fail('PERF_ROUNDS must be 2–5.');
if (!Number.isInteger(warmup) || warmup < 0 || warmup > 25) fail('PERF_WARMUP must be 0–25.');
if (!concurrencyLevels.length || concurrencyLevels.some(n => !Number.isInteger(n) || n < 1 || n > 50)) {
  fail('PERF_CONCURRENCY_LEVELS must be comma-separated integers from 1–50.');
}

let cookieFile = process.env.PERF_COOKIE_FILE ?? '';
if (cookieFile && !isAbsolute(cookieFile)) cookieFile = resolve(projectRoot, cookieFile);
if (!process.env.PERF_COOKIE && cookieFile && !existsSync(cookieFile)) {
  fail(`Cookie file not found: ${cookieFile}\nLog in to the isolated performance API and export a cookie jar first.`);
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function parseRun(stdout) {
  const marker = stdout.lastIndexOf('\n{');
  if (marker < 0) throw new Error('Benchmark output did not contain its JSON results block.');
  return JSON.parse(stdout.slice(marker + 1).trim());
}

const allRuns = [];
for (const concurrency of [...new Set(concurrencyLevels)]) {
  for (let round = 1; round <= rounds; round++) {
    console.log(`\nRunning ${rounds}-round suite: concurrency ${concurrency}, round ${round}/${rounds}`);
    const env = {
      ...process.env,
      PERF_URL: url,
      PERF_REQUESTS: String(requests),
      PERF_CONCURRENCY: String(concurrency),
      PERF_WARMUP: String(warmup),
      PERF_TIMEOUT_MS: String(timeoutMs),
    };
    if (cookieFile) env.PERF_COOKIE_FILE = cookieFile;
    const run = spawnSync(process.execPath, [benchmarkPath], { cwd: projectRoot, env, encoding: 'utf8' });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.error || run.status !== 0) {
      allRuns.push({ concurrency, round, failed: true, error: run.error?.message ?? `exit ${run.status}` });
      console.error('This run did not complete successfully; continuing to collect the remaining samples.');
      continue;
    }
    try { allRuns.push({ concurrency, round, failed: false, result: parseRun(run.stdout) }); }
    catch (error) { allRuns.push({ concurrency, round, failed: true, error: error.message }); }
  }
}

const summaries = [...new Set(concurrencyLevels)].map(concurrency => {
  const results = allRuns.filter(x => x.concurrency === concurrency && !x.failed).map(x => x.result);
  return {
    concurrency,
    completedRounds: results.length,
    totalRounds: rounds,
    medianRps: Number(median(results.map(x => x.requestsPerSecond)).toFixed(2)),
    medianLatencyMs: Number(median(results.map(x => x.latencyMs.median)).toFixed(2)),
    medianP95Ms: Number(median(results.map(x => x.latencyMs.p95)).toFixed(2)),
    successRatePercent: Number(median(results.map(x => x.successful / x.requests * 100)).toFixed(2)),
  };
});

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputDir = resolve(serverRoot, 'data', 'performance', 'reports');
mkdirSync(outputDir, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  target: url,
  requestsPerRound: requests,
  warmupPerRound: warmup,
  concurrencyLevels: [...new Set(concurrencyLevels)],
  rounds,
  note: 'Local synthetic-data benchmark. Results vary with machine load and database cache. This is not production capacity certification.',
  summaries,
  runs: allRuns,
};
const jsonPath = resolve(outputDir, `load-test-${timestamp}.json`);
const mdPath = resolve(outputDir, `load-test-${timestamp}.md`);
writeFileSync(jsonPath, JSON.stringify(report, null, 2));
const lines = [
  '# StudyPrior repeatable API load-test results', '',
  `- Generated: ${report.generatedAt}`,
  `- Target: \`${url}\``,
  `- Requests per round: ${requests}; warm-up: ${warmup}; rounds: ${rounds}`,
  '- Dataset: use the isolated synthetic performance database, not production/student data.',
  '- Interpret as local comparative evidence, not a production capacity guarantee.', '',
  '| Concurrency | Completed rounds | Median req/s | Median latency (ms) | Median p95 (ms) | Success rate |',
  '|---:|---:|---:|---:|---:|---:|',
  ...summaries.map(s => `| ${s.concurrency} | ${s.completedRounds}/${s.totalRounds} | ${s.medianRps} | ${s.medianLatencyMs} | ${s.medianP95Ms} | ${s.successRatePercent}% |`),
  '', '## Individual runs', '',
  '| Concurrency | Round | Requests/s | Median ms | p95 ms | Passed |',
  '|---:|---:|---:|---:|---:|---:|',
  ...allRuns.map(r => r.failed
    ? `| ${r.concurrency} | ${r.round} | — | — | — | No (${r.error}) |`
    : `| ${r.concurrency} | ${r.round} | ${r.result.requestsPerSecond} | ${r.result.latencyMs.median} | ${r.result.latencyMs.p95} | ${r.result.failed === 0 ? 'Yes' : 'No'} |`),
  '', '## Notes', '',
  'Compare runs only when dataset profile, API version, machine, and server settings are held constant. Repeat on another day before making strong performance claims.',
];
writeFileSync(mdPath, lines.join('\n'));
console.log(`\nSaved JSON: ${jsonPath}`);
console.log(`Saved Markdown: ${mdPath}`);
if (allRuns.some(x => x.failed) || summaries.some(x => x.completedRounds !== rounds)) process.exitCode = 1;
