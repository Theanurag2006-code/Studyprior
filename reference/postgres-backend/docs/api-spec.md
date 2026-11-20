# StudyPrior API v1

Base path `/api/v1`. JSON in, JSON out. Cookie auth (`sp_session`, HttpOnly). State-changing requests from a signed-in session must send `X-CSRF-Token`.

**Success:** `{ "data": ..., "meta": { ... } }`  **Error:** `{ "error": { "code", "message", "details"?, "requestId" } }`
Status codes: 200/201 ok, 400 bad JSON, 401 `UNAUTHENTICATED` / `INVALID_CREDENTIALS`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `EMAIL_TAKEN`/`CONFLICT`, 413, 422 `VALIDATION_ERROR` (`details: [{ field, message }]`), 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`.
Pagination (planned endpoints): `?limit=20&cursor=...` returning `meta.nextCursor`.

## Implemented now
| Method & path | Auth | Notes |
|---|---|---|
| `GET /health` | none | `{ status: "ok"\|"degraded", database: "up"\|"down", time }`; 503 when the database is unreachable. No secrets |
| `GET /academic-settings` | none | `{ juniorMaxSemester, maxSemester }` |
| `POST /auth/register` | none (rate-limited) | Body: `name, email, password (10+), department, branch?, college, enrollmentNumber?, enrollmentYear, graduationYear, currentSemester`. Unknown keys (e.g. `accountRole`, `academicLevel`) -> 422. Returns 201 `{ user, csrfToken }` and sets the cookie |
| `POST /auth/login` | none (rate-limited) | `{ email, password }` -> 200 `{ user, csrfToken }`; same 401 for unknown email and wrong password |
| `POST /auth/logout` | cookie + CSRF | Deletes the session, clears the cookie |
| `GET /auth/me` | cookie | `{ user, csrfToken }`; 401 if not signed in |
| `GET /profile` | cookie | `{ user }` |
| `PATCH /profile` | cookie + CSRF | Any of: `name, college, department, branch, enrollmentNumber, enrollmentYear, graduationYear, bio, profilePhotoUrl (https), availableForQuestions, publicContributions, themePreference`. Anything else (role, level, semester, email, password) -> 422 |

User object (`academicLevel`, `currentSemester`, `enrollmentYear`, `graduationYear` are `null` for ADMIN accounts): `id, name, email, accountRole, academicLevel, department, branch, college, enrollmentNumber, enrollmentYear, graduationYear, currentSemester, bio, profilePhotoUrl, availableForQuestions, publicContributions, themePreference, createdAt`. Never a password hash.

## PLANNED (not implemented): next milestone contracts
| Endpoint | Purpose |
|---|---|
| `GET /subjects?department&semester&q&cursor` | Published catalog subjects |
| `GET /subjects/:id` | Subject with units, topics and per-topic summaries |
| `POST /subjects` | Publish a community subject + topics in ONE transaction (all or nothing); 409 on duplicates |
| `POST /subjects/:id/topics` | Add a topic to an existing subject |
| `GET /topics/:id` | Topic detail + `{ overall, senior, junior }` breakdowns from `summarizeTopic` (`sampleCount, priorityScore\|null, priorityLabel, confidence{label,sampleCount}, means, message`) |
| `GET /topics/:id/ratings` | Paginated public feedback (contributor name/level only if `publicContributions`) |
| `PUT /topics/:id/rating` | Create or edit the caller's single rating (any Junior or Senior student); stores the level snapshot |
| `GET/POST/DELETE /me/subjects` | Personal subject list (`user_subjects`) |
| `GET/PUT/DELETE /me/saved-topics/:topicId` | Saved topics |
| `GET/POST/PATCH/DELETE /me/notes` | Private notes (owner only) |
| `GET/POST/PATCH/DELETE /me/plans` | Planner; completing creates one `study_activity` row |
| `GET /me/streak` | From `study_activity` |
| `GET/PUT/DELETE /me/subject-drafts` | Private drafts |
