# Data model (PostgreSQL via Prisma)

Source: `backend/prisma/schema.prisma` and `backend/prisma/migrations/0001_init/migration.sql`.

| Table | Purpose | Key rules |
|---|---|---|
| `users` | Accounts | `email` unique, stored trimmed/lower-case (CHECK); `account_role` STUDENT/ADMIN; **students** always have `current_semester`, `enrollment_year`, `graduation_year` and a derived `academic_level`; **admins** have all four as NULL (CHECK `ck_users_role_academic`, migration 0002); password stored only as Argon2id hash; CHECKs on semester and years |
| `academic_settings` | Junior/Senior rule | exactly one row (`id = 1`); `junior_max_semester` < `max_semester` |
| `sessions` | Server-side login sessions | `token_hash` unique (HMAC of cookie token); per-session `csrf_token`; `expires_at`; deleted with the user |
| `subjects` | Shared catalog | UNIQUE(`name_normalized`, `department`, `semester`) stops duplicates; `created_by_id` for community subjects; `status` PUBLISHED / PENDING_REVIEW |
| `units` | Parts of a subject | UNIQUE(subject, `unit_number`) and UNIQUE(subject, `name_normalized`) |
| `topics` | Rateable items | UNIQUE(subject, `name_normalized`); belongs to a unit; `estimated_hours` 0.5-200 |
| `user_subjects` | A student's personal subject list | PRIMARY KEY (`user_id`, `subject_id`) = the unique rule; never changes the shared catalog |
| `ratings` | One rating per user per topic | UNIQUE(`user_id`, `topic_id`); four 1-5 CHECKs; `academic_level_at_submission` snapshot |
| `saved_topics` | Bookmarks | PRIMARY KEY (`user_id`, `topic_id`) |
| `study_plans` | Planner | status PLANNED/IN_PROGRESS/COMPLETED; purpose enum + `custom_purpose` (CHECK: required exactly when purpose is OTHER); minutes 5-600 |
| `study_activity` | Meaningful study events for streaks | UNIQUE(`study_plan_id`, `activity_type`) prevents double-counting; index (`user_id`, `occurred_on`) |
| `notes` | Private notes | owner-only; optional links to subject/topic/plan (SET NULL if those are deleted) |
| `subject_drafts` | Private create-subject drafts | `topics` JSONB; publishing will be one transaction in the next milestone |

## Relationships
`users 1-* sessions, user_subjects, ratings, saved_topics, study_plans, study_activity, notes, subject_drafts` (all `ON DELETE CASCADE`).
`subjects 1-* units 1-* topics`; `topics 1-* ratings, saved_topics, study_plans`.
Catalog rows keep `created_by_id` as `SET NULL` when an account is deleted, so community content survives.

## Deliberately not here yet
Messaging, notifications, reports/blocks and audit logs are future extensions.

## Migrations
`npm run migrate:dev` (create/apply in development), `npm run migrate:deploy` (apply in production), `npm run migrate:test` (test database). CHECK constraints exist only in SQL because Prisma cannot model them.
