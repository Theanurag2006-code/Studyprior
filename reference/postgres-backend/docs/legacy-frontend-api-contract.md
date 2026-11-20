> **Superseded.** This was the frontend-first contract for the demo adapter. The real API lives under `/api/v1` and is specified in `docs/api-spec.md`. The adapter paths must be updated in the next milestone (see `docs/frontend-integration.md`).

# StudyPrior API contract used by the frontend (Milestone 04)

Set `VITE_API_BASE_URL` to enable the HTTP adapter (`src/services/api.ts`). Leave it empty for demo mode (device-local storage, clearly labelled in the UI).
Responses use `{ "data": ... }` on success and `{ "error": { "code", "message" } }` on failure. Cookies are sent (`credentials: 'include'`).
The UI shows success only after a 2xx response; any error (including network failure) is shown and nothing is added locally.

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/api/catalog` | `{ subjects, units, topics, ratings, seniors }` | Ratings include `isMine: true` for the caller's own rating. Subjects may carry `status: 'PUBLISHED' \| 'PENDING_REVIEW'`. |
| POST | `/api/subjects` | Publish a community subject with topics | Body: `{ name, branch, semester, description, topics: [{ name, unit, description, hours? }] }`. Returns `{ subject, units, topics }`. Return `status: 'PENDING_REVIEW'` if moderation applies. 409 on duplicates, 422 on validation errors. |
| POST | `/api/subjects/:id/topics` | Add one topic to an existing subject | Body: `{ name, unit, description, hours? }`. Returns `{ topic, unit? }` (`unit` only if newly created). 409 if the topic name already exists in that subject. |
| POST | `/api/topics/:id/ratings` | Create or update the caller's one rating for a topic | Body: `{ importance, difficulty, exam, interview, advice, mistakes }` (1-5). Server derives Junior/Senior level, enforces `UNIQUE(userId, topicId)`, allows any authenticated student. Returns the rating (`isMine: true`). |

Still device-local (no endpoint yet): profile, study plans, personal notes, subject drafts, messages, notifications.

## Schema changes needed when the backend adds these
- `study_plans`: add nullable `purpose` (enum) and `custom_purpose` (varchar 60). Existing rows stay valid (NULL).
- `notes`: `id, user_id, title, body, subject_id?, topic_id?, plan_id?, created_at, updated_at`; private to `user_id`.
- `subjects`: add `status` (`PUBLISHED`/`PENDING_REVIEW`), `created_by`, `description`; unique `(lower(name), branch, semester)`.
- `ratings`: unique `(user_id, topic_id)`; store contributor level at write time.

## Milestone 05: subject and topic profiles
Today the frontend computes profile aggregates from `/api/catalog` (`ratings` + `contributors`). When the backend exists, compute them server-side and expose:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/subjects/:id/overview` | Units, topics, per-topic summaries, subject totals (ratings across topics, written feedback, distinct descriptions, distinct contributors), priority mix, recurring themes |
| GET | `/api/topics/:id` | Topic detail with parent subject/unit, summary, per-dimension distributions |
| GET | `/api/topics/:id/feedback?sort=&level=&written=&cursor=` | Paginated contributions with public contributor fields only |
| GET | `/api/topics/:id/my-rating` | The caller's own rating, if any |
| PATCH | `/api/topics/:id/ratings/me` | Edit the caller's rating (never another user's); POST on the same path family creates it |

`contributors` in `/api/catalog` (or the feedback payload) must contain only `{ id, name, level, branch, public }`. When `public` is false the UI shows "Anonymous student" and hides level and branch. Never include email or private fields.

### Metric definitions (used by the UI and tests)
- **Ratings (votes):** rating records; one per user per topic (`UNIQUE(user_id, topic_id)`); an edit replaces the record, so nothing is double-counted.
- **Written feedback:** ratings whose advice text is non-empty after trimming. Rating-only entries are votes, not feedback.
- **Distinct descriptions:** unique advice texts, compared case-insensitively with whitespace collapsed.
- **Contributors:** distinct users. At subject level each user counts once however many topics they rated; "ratings across topics" counts every rating record.
- **Distribution percentages:** share of valid votes for that dimension, largest-remainder rounded so they total 100; no votes means no percentages and no mean.
- **Confidence:** Limited data under 3 ratings, Moderate 3-5, High 6+. Priority score formula is unchanged: 40% importance, 30% exam, 20% interview, 10% difficulty (0-100).
- No subject-level rating exists, so subject figures are labelled as aggregates across its topics.
