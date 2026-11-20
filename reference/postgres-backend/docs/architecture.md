# StudyPrior architecture (Milestone 02: foundation + identity)

## The big picture
```
Browser (React app)  --HTTPS + cookie-->  Express API (backend/)  --Prisma-->  PostgreSQL
```
The React app only displays data and collects input. The **API is the source of truth** for who you are, what you may do, and every score. PostgreSQL stores the data and enforces the hard rules (uniqueness, 1-5 rating bounds) even if the code has a bug.

## Why accounts come first (the "bridge point")
Everything useful in StudyPrior belongs to someone:
- a **rating** must remember who wrote it, so one person cannot rate the same topic twice (`UNIQUE(user_id, topic_id)`) and can only edit their own;
- your **subject list, saved topics and study plans** must follow you across devices;
- your **private notes** must be visible to you and nobody else;
- **Junior/Senior** must be decided by the server from your semester, so nobody can promote themselves from the browser.

The frontend can *show* a role or an owner, but it is never trusted to *decide* one. Every rule is enforced again on the server.

## Folder map (`backend/src`)
| Folder | Job |
|---|---|
| `config/` | Reads and validates environment variables at startup (fails fast, never prints secrets) |
| `domain/` | Pure rules with no database: priority formula, confidence, academic level, years, streak. Fully unit-tested |
| `schemas/` | Zod request validation (unknown fields are rejected) |
| `services/` | Business logic: register, login, profile, sessions |
| `routes/` | HTTP endpoints; thin wrappers around services |
| `middleware/` | Sessions, CSRF, rate limits, error formatting |
| `lib/` | Errors, logger, crypto (Argon2id, token hashing) |

## Sessions and cookies
1. Register/login creates a random 32-byte token. The browser gets it in an **HttpOnly** cookie (`sp_session`), so page scripts cannot read it.
2. The database stores only an **HMAC of the token** (keyed with `SESSION_SECRET`), never the token. A leaked database cannot be replayed as logins.
3. Sessions live in the `sessions` table; logout deletes the row, so the cookie is dead immediately. Expiry defaults to 7 days.
4. Cookies are `Secure` in production and `SameSite=Lax` by default. If the frontend and API are on different *sites* (different registrable domains) you need `COOKIE_SAMESITE=none` in production, which requires HTTPS; same-site setups (e.g. `app.example.com` + `api.example.com`) keep `lax`.

## CSRF protection (layered)
1. SameSite cookies. 2. Any `Origin` header must equal `FRONTEND_ORIGIN`. 3. Every state-changing request from a signed-in session must send that session's `X-CSRF-Token` (returned by register/login/`/auth/me`). CORS allows one explicit origin with credentials, never `*`.

## Other safeguards
Helmet security headers; rate limits (login 10 / 15 min, register 10 / hour, general 600 / 15 min per IP); Argon2id password hashing; the same error for "unknown email" and "wrong password"; request bodies/cookies/query strings are never logged; error responses never include stack traces or database text; account roles can only be created by the admin CLI.

## Priority formula (single source of truth: `domain/priority.ts`)
Ratings are integers 1-5. `norm(x) = (x-1)/4`.
```
priority_score = ROUND(100 * (4/9*norm(importance) + 1/3*norm(exam) + 2/9*norm(interview)))
```
This keeps the original 40:30:20 weights, rescaled to total 100%. **Difficulty and confidence are not in the formula.** Topic aggregates average each dimension first, then apply the formula once. Examples: all 1s -> 0, all 5s -> 100, importance 5 / exam 4 / interview 5 -> 92. No ratings -> score is `null` and the message is "No ratings yet" (never 0/100).

Labels: 85-100 Must Study, 70-84 High Priority, 50-69 Medium, 0-49 Low.
Confidence (sample size only, reported separately for all ratings and for Senior-only): 0 No ratings yet, 1-2 Limited data, 3-5 Early signal, 6+ Broader community signal. Senior-only uses the level **snapshot** saved with each rating (`academic_level_at_submission`), so a later semester change never rewrites history.

## Academic level
Only students have one. Administrator accounts are not students: their academic level, semester and enrollment years are NULL, enforced by a database CHECK. Admins cannot rate topics as Junior/Senior (the ratings snapshot column is NOT NULL), which the rating endpoints must also enforce.

Stored rule in `academic_settings` (default: semesters 1-4 Junior, 5-8 Senior, max 8). `deriveAcademicLevel()` is the only code that turns a semester into a level. Clients cannot send `academicLevel` or `accountRole` (rejected with 422).

## Study streak (definition)
Consecutive UTC calendar days with at least one meaningful activity: completing a study plan (recorded once per plan) or a logged study session. Ends today, or yesterday if nothing is logged yet today. Never invented. (Computed by `domain/streak.ts`; the endpoint arrives later.)

## Decisions and known limits
- Express 4 + Prisma + Zod + Vitest/Supertest, as recommended; sessions are custom (small, auditable) instead of an extra session library.
- Migration `0001_init` was **written by hand** because the build sandbox had no network or database. Verify with `npm run migrate:dev` locally; see the README.
- Not in this milestone: email verification, password reset/change, OAuth, messaging, notifications, reporting, admin dashboard, the catalog/rating endpoints.
