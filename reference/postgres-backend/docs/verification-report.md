# Verification report (Milestone 02 review pass)

Environment: no internet (the npm registry host does not resolve), no PostgreSQL, no Docker. Global TypeScript 6.0.3 and tsx only.

## Completed (actually executed, with results)
| Check | Command | Result |
|---|---|---|
| Static schema-vs-migration comparison | `node scripts/verify-migrations.mjs` | Passed: 13 tables, 120 columns, 20 indexes, 22 foreign keys, 8 enums across 2 migrations, no discrepancies |
| That the checker really detects problems | 6 deliberately broken copies (NULL rule, missing index, FK action, enum value, column type, missing migration) | All 6 failed as expected; the untouched copy passed |
| Backend unit-test files | `src/domain/priority.unit.test.ts` (9 tests) and `academic.unit.test.ts` (5 tests), run through a minimal stand-in for Vitest | 14 passed, 0 failed. **Not the real Vitest runner** (it could not be installed); the stand-in was shown to report a failing test correctly |
| Strict type-check of dependency-free code | `tsc --ignoreConfig --noEmit --strict` on `src/domain/*.ts` | Passed |
| Syntax scan of every backend and frontend TypeScript file | `tsc` per file, filtering TS1xxx | 0 syntax errors |

## Could NOT run
| Check | Why |
|---|---|
| `npm install` (and therefore **package-lock.json**) | Network unreachable: `curl` could not resolve the host and `npm install` timed out. No lockfile was generated; none was invented |
| `npm run typecheck` with real dependency types | Dependencies not installed (`tsc` reports missing `node` types and modules) |
| `prisma generate`, `prisma validate`, `prisma migrate`, `db:check-drift` | Prisma not installable offline; no PostgreSQL |
| Real Vitest unit run, **PostgreSQL integration tests** (`npm run test:int`: auth, sessions, CSRF, constraints, admin accounts, privacy, health) | Need installed packages and a database |
| `npm run build`, manual health/register/login calls against a live server | Same reasons |
| Frontend `npm run build` / `npm test` | Not installable offline (frontend files were not changed in this pass) |

## Changes in this pass
1. **Administrator model.** Migration `0002_admin_accounts_not_students`: `users.academic_level`, `current_semester`, `enrollment_year`, `graduation_year` become nullable; admin rows are set to NULL (only rows with `account_role = 'ADMIN'`, student rows untouched); new CHECK `ck_users_role_academic` makes students require all four and admins forbid them. Prisma schema fields are optional; admin CLI no longer writes placeholder SENIOR/semester 8; profile updates reject student-only fields for admins; new integration tests cover the rule.
2. **Schema/migration review.** Added `scripts/verify-migrations.mjs` (`npm run db:check-sync`) and `scripts/check-drift.cjs` (`npm run db:check-drift`, needs a shadow database; `docker/init-test-db.sql` now creates `studyprior_shadow`).
3. No catalog, rating, planner or notes endpoints were added.

## Remaining risks
- The integration tests have never run: expect possible small fixes on first execution.
- The static checker does not compare DEFAULT values or CHECK constraints (Prisma cannot model CHECKs). `db:check-drift` against real PostgreSQL is the authoritative test and has not run.
- TypeScript is pinned to ~5.6.3. TypeScript 6+ reports TS5107 for `moduleResolution: node` (seen with the sandbox's global 6.0.3); keep the pinned version or migrate the tsconfig deliberately.
- `argon2` is a native module: it needs a prebuilt binary or a C++ toolchain on install.
- No lockfiles exist yet. Run `npm install` in `backend/` and in the project root, then commit both `package-lock.json` files.
