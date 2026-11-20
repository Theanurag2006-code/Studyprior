# M4 Quick Runbook — StudyPrior

## What this kit adds

Copy the two new scripts into `server/scripts/` and the alpha feedback page into `docs/`. The original performance seed and authenticated benchmark runner are included here as reference/backup copies; do not regenerate the synthetic database if your existing medium performance DB is already populated.

## 1. Install files

From the extracted kit, copy:

- `server/scripts/perf-run-suite.mjs` → your project's `server/scripts/`
- `server/scripts/db-query-audit.mjs` → your project's `server/scripts/`
- `docs/alpha-feedback-form.html` → your project's `docs/`
- `docs/M4_COMPLETION_CHECKLIST.md` and `docs/M4_QUICK_RUNBOOK.md` → your project's `docs/`

Also ensure `server/scripts/perf-benchmark-auth-v2.mjs` is present. The kit includes it if you need a replacement. It is read-only and restricts requests to localhost.

## 2. Run repeated API load tests

Keep the isolated performance API running on port 4001. Do not point the load test at production or your normal student database. Then run this single command from the project root:

```bash
PERF_URL=http://localhost:4001/api/v1/catalog PERF_COOKIE_FILE="$PWD/server/data/performance/perf-cookies.txt" node server/scripts/perf-run-suite.mjs
```

Default run: 3 rounds each at concurrency 5 and 10, 40 requests per round, 3 warm-up requests. The script saves timestamped JSON and Markdown reports under `server/data/performance/reports/`. It exits non-zero if one or more rounds fail. Avoid running other heavy tasks during the benchmark.

Optional settings: `PERF_REQUESTS=60`, `PERF_ROUNDS=2` (minimum 2), `PERF_CONCURRENCY_LEVELS=2,5,10`, `PERF_WARMUP=3`.

## 3. Run the database audit

Use the isolated performance database:

```bash
DB_PATH="$PWD/server/data/performance/studyprior-perf.db" node server/scripts/db-query-audit.mjs
```

This is read-only: no migrations, inserts, or index creation. It checks SQLite integrity and foreign keys, lists indexes, and shows query plans. Results are saved under `server/data/performance/reports/`.

If the conversation-list query still shows a table scan or temporary sort, evaluate candidate composite indexes only on a disposable copy first. Do not execute ad-hoc SQL against your real DB; a permanent index must be added through a versioned schema migration and verified by the full test suite.

## 4. Collect alpha feedback

Open `docs/alpha-feedback-form.html` in a browser. It works offline. Ask testers to try the app and complete the form. Each submission downloads an anonymous JSON file. The form does not transmit responses automatically and does not ask for personal identifiers. Review each file before sharing it with the project team.

## 5. Final regression checks

```bash
npm run api:test
npm test
npm run build
```

Save the final terminal output. Only then update the M4 report/PPT with the new actual load-test, audit and alpha-feedback results.

## Important

The performance test uses synthetic accounts and synthetic academic data. Keep the port-4001 server and performance database separate from the normal port-4000 app. Stop the performance server with Ctrl+C in its own terminal after testing.

## 6. Summarize real alpha feedback

Place tester JSON files in `docs/alpha-feedback-responses/`, then run:

```bash
node server/scripts/analyze-alpha-feedback.mjs
```

It creates an aggregate JSON + Markdown report. Review and anonymize comments before quoting them in a submission. The script does not modify the recommendation formula; the project team must decide whether a change is justified and add regression tests.
