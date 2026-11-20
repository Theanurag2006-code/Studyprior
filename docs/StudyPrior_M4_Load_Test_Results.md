# StudyPrior — M4 Load-Test Results

## Test scope

- Endpoint: `GET /api/v1/catalog`
- Environment: isolated local performance API on port `4001`
- Authentication: authenticated session cookie present
- Dataset: synthetic medium performance database
- Warm-up: 3 requests per round
- Measured requests: 40 per round
- Rounds: 3 at each concurrency level
- Total measured requests: 240

## Results summary

| Concurrency | Mean throughput across rounds | Mean request latency across rounds | Mean round P95 latency | Successful requests | Failed requests |
|---:|---:|---:|---:|---:|---:|
| 5 | 12.81 req/s | 381.52 ms | 714.48 ms | 120/120 | 0 |
| 10 | 12.99 req/s | 741.63 ms | 1,228.78 ms | 120/120 | 0 |

All 240 measured requests returned HTTP 200. No request failures were reported.

## Per-round observations

| Concurrency | Round | Throughput | Average latency | P95 latency | P99 latency |
|---:|---:|---:|---:|---:|---:|
| 5 | 1 | 13.12 req/s | 377.13 ms | 672.08 ms | 832.77 ms |
| 5 | 2 | 12.97 req/s | 370.62 ms | 617.84 ms | 812.57 ms |
| 5 | 3 | 12.35 req/s | 396.82 ms | 853.51 ms | 1,090.74 ms |
| 10 | 1 | 12.89 req/s | 746.53 ms | 858.84 ms | 1,395.86 ms |
| 10 | 2 | 13.11 req/s | 726.96 ms | 1,303.01 ms | 1,734.52 ms |
| 10 | 3 | 12.96 req/s | 751.41 ms | 1,524.48 ms | 2,271.82 ms |

## Response-size observation

The benchmark runner reported an average response body size of **5,995,977 bytes per request** (approximately **5.72 MiB**). This is a notable optimization target. The same reported response size appeared in all six rounds.

Potential follow-up investigation: determine which catalog fields and nested collections account for the response size; consider pagination or lazy loading for large collections, reducing duplicate/unused fields, and verifying HTTP compression. Any change should preserve the existing response contract and pass regression tests.

## Interpretation

- Throughput remained almost flat when concurrency increased from 5 to 10 (about 12.81 to 12.99 requests/second).
- Mean request latency increased from about 382 ms to about 742 ms.
- Mean round P95 latency increased from about 714 ms to about 1,229 ms.
- This suggests the endpoint does not gain meaningful throughput from doubling concurrency in this test and that latency degrades under the higher concurrency setting.
- The sample is useful as a repeatable local baseline, but it is not a production-capacity claim. Each round contained 40 measured requests, and results can vary with the development machine, database cache, and background activity.

## Limitations and next evidence required

1. These results use synthetic data and a local performance server, not production traffic.
2. The benchmark covers the authenticated catalog GET endpoint only; it does not represent all routes or write-heavy workloads.
3. The test is a small repeatability/load check, not a full stress, soak, or endurance test.
4. Run the read-only database query audit and inspect its saved output before deciding whether new indexes are justified.
5. Investigate catalog response composition and size before changing query logic. Re-run the same benchmark after each measured optimization and run the complete automated test suite.
6. Recommendation refinement still requires genuine alpha-tester feedback. Do not claim feedback-driven algorithm changes until feedback has been collected, evaluated, implemented where justified, and covered by tests.

## Evidence source

Terminal output supplied for the three-round benchmark suite. The generated raw JSON and Markdown files are stored locally in the project's `server/data/performance/reports/` directory; preserve those files with the project evidence.
