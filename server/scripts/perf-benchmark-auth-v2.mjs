#!/usr/bin/env node
/**
 * StudyPrior local API benchmark with optional authenticated-session support.
 * Node 22.13+; no external dependencies.
 *
 * Examples:
 *   PERF_URL=http://localhost:4001/api/v1/academic-settings \
 *   PERF_REQUESTS=100 PERF_CONCURRENCY=10 \
 *   node server/scripts/perf-benchmark-auth-v2.mjs
 *
 * Authenticated route:
 *   PERF_COOKIE_FILE=/tmp/studyprior-perf-cookies.txt \
 *   PERF_URL=http://localhost:4001/api/v1/catalog \
 *   PERF_REQUESTS=100 PERF_CONCURRENCY=10 \
 *   node server/scripts/perf-benchmark-auth-v2.mjs
 *
 * PERF_HEADERS may contain a JSON object of additional request headers.
 * Requests are restricted to loopback hosts and GET/HEAD. Keep request counts
 * below the API rate limit. This is a local benchmark, not production capacity certification.
 */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const rawUrl = process.env.PERF_URL ?? 'http://localhost:4001/api/v1/health';
const requests = Number.parseInt(process.env.PERF_REQUESTS ?? '100', 10);
const concurrency = Number.parseInt(process.env.PERF_CONCURRENCY ?? '10', 10);
const warmup = Number.parseInt(process.env.PERF_WARMUP ?? '5', 10);
const timeoutMs = Number.parseInt(process.env.PERF_TIMEOUT_MS ?? '10000', 10);
const method = (process.env.PERF_METHOD ?? 'GET').toUpperCase();

let url;
try { url = new URL(rawUrl); }
catch { console.error(`Invalid PERF_URL: ${rawUrl}`); process.exit(1); }

const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
if (!['http:', 'https:'].includes(url.protocol) || !allowedHosts.has(url.hostname)) {
  console.error('Safety check: PERF_URL must target localhost, 127.0.0.1, or ::1.');
  process.exit(1);
}
if (!['GET', 'HEAD'].includes(method)) {
  console.error('PERF_METHOD must be GET or HEAD; this runner is for read-only endpoint benchmarks.');
  process.exit(1);
}
if (!Number.isInteger(requests) || requests < 1 || requests > 800) {
  console.error('PERF_REQUESTS must be an integer from 1 to 800.'); process.exit(1);
}
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 50) {
  console.error('PERF_CONCURRENCY must be an integer from 1 to 50.'); process.exit(1);
}
if (!Number.isInteger(warmup) || warmup < 0 || warmup > 25) {
  console.error('PERF_WARMUP must be an integer from 0 to 25.'); process.exit(1);
}
if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
  console.error('PERF_TIMEOUT_MS must be an integer from 100 to 120000.'); process.exit(1);
}

let extraHeaders = {};
if (process.env.PERF_HEADERS) {
  try {
    extraHeaders = JSON.parse(process.env.PERF_HEADERS);
    if (!extraHeaders || Array.isArray(extraHeaders) || typeof extraHeaders !== 'object') throw new Error('not an object');
    extraHeaders = Object.fromEntries(Object.entries(extraHeaders).map(([k, v]) => [k, String(v)]));
  } catch {
    console.error('PERF_HEADERS must be a JSON object, e.g. {"x-example":"value"}.'); process.exit(1);
  }
}

function cookieFromJar(filePath, targetUrl) {
  const text = readFileSync(filePath, 'utf8');
  const now = Math.floor(Date.now() / 1000);
  const cookies = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line || (line.startsWith('#') && !line.startsWith('#HttpOnly_'))) continue;
    const parts = line.split('\t');
    if (parts.length < 7) continue;
    const [domainRaw, , cookiePath, secure, expiryRaw, name, value] = parts;
    const domain = domainRaw.replace(/^#HttpOnly_/, '').replace(/^\./, '').toLowerCase();
    const host = targetUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    const pathMatch = targetUrl.pathname.startsWith(cookiePath || '/');
    const secureMatch = secure !== 'TRUE' || targetUrl.protocol === 'https:';
    const expiry = Number(expiryRaw);
    const domainMatch = host === domain || host.endsWith(`.${domain}`);
    if (domainMatch && pathMatch && secureMatch && (!Number.isFinite(expiry) || expiry === 0 || expiry > now)) {
      cookies.push(`${name}=${value}`);
    }
  }
  return cookies.join('; ');
}

let cookie = process.env.PERF_COOKIE ?? '';
if (!cookie && process.env.PERF_COOKIE_FILE) {
  try { cookie = cookieFromJar(process.env.PERF_COOKIE_FILE, url); }
  catch (error) { console.error(`Could not read PERF_COOKIE_FILE: ${error.message}`); process.exit(1); }
}
const headers = { accept: 'application/json', ...extraHeaders };
if (cookie) headers.cookie = cookie;

async function requestOnce() {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      method,
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.arrayBuffer();
    return { status: response.status, ms: performance.now() - started, bytes: body.byteLength, error: null };
  } catch (error) {
    return { status: 'ERROR', ms: performance.now() - started, bytes: 0,
      error: error?.name === 'TimeoutError' ? 'timeout' : (error?.name ?? 'request_error') };
  }
}

async function runBatch(total, workers) {
  const results = new Array(total);
  let next = 0;
  const runWorker = async () => {
    while (true) {
      const index = next++;
      if (index >= total) return;
      results[index] = await requestOnce();
    }
  };
  await Promise.all(Array.from({ length: Math.min(workers, total) }, runWorker));
  return results;
}
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

console.log('StudyPrior API benchmark (authenticated-session capable)');
console.log(`Target:      ${url.href}`);
console.log(`Method:      ${method}`);
console.log(`Auth cookie: ${cookie ? 'present' : 'not supplied'}`);
console.log(`Warm-up:     ${warmup}`);
console.log(`Requests:    ${requests}`);
console.log(`Concurrency: ${concurrency}`);

if (warmup > 0) {
  const warm = await runBatch(warmup, Math.min(concurrency, warmup));
  const bad = warm.filter(r => typeof r.status !== 'number' || r.status < 200 || r.status >= 400);
  if (bad.length) {
    console.error('Warm-up failed. Check the API, route, authentication cookie and permissions.');
    console.error(warm.map(r => ({ status: r.status, error: r.error })));
    process.exit(2);
  }
}

const wallStart = performance.now();
const results = await runBatch(requests, concurrency);
const elapsedMs = performance.now() - wallStart;
const durations = results.map(r => r.ms).sort((a, b) => a - b);
const statusCounts = {};
const errors = {};
let totalBytes = 0;
for (const result of results) {
  const key = String(result.status);
  statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  if (result.error) errors[result.error] = (errors[result.error] ?? 0) + 1;
  totalBytes += result.bytes;
}
const successful = results.filter(r => typeof r.status === 'number' && r.status >= 200 && r.status < 400).length;
const failed = requests - successful;
const seconds = elapsedMs / 1000;

console.log('\nResults');
console.log(JSON.stringify({
  target: url.href, method, authenticated: Boolean(cookie), requests, concurrency,
  elapsedMs: Number(elapsedMs.toFixed(2)),
  requestsPerSecond: Number((requests / Math.max(seconds, 0.000001)).toFixed(2)),
  successful, failed, statusCounts, errors,
  responseBytes: { total: totalBytes, average: Number((totalBytes / requests).toFixed(1)) },
  latencyMs: {
    min: Number((durations[0] ?? 0).toFixed(2)),
    average: Number((durations.reduce((sum, n) => sum + n, 0) / Math.max(1, durations.length)).toFixed(2)),
    median: Number(percentile(durations, 0.50).toFixed(2)),
    p95: Number(percentile(durations, 0.95).toFixed(2)),
    p99: Number(percentile(durations, 0.99).toFixed(2)),
    max: Number((durations.at(-1) ?? 0).toFixed(2)),
  },
}, null, 2));
if (failed > 0) process.exitCode = 1;
