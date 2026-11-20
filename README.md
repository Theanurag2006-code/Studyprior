# StudyPrior

**Current project guide (updated 15 November 2026).** Start with `docs/running-locally.md`. The current project includes a React + TypeScript + Vite frontend and a Node.js + SQLite API. `docs/api-spec.md` documents the API, and `docs/m4-implementation-batch-01.md` records the 15 November implementation batch and its verification status; `docs/implementation-report-2026-10-27.md` is the earlier M2/M3 history.

## Current application status

- **Demo mode:** leave `VITE_API_BASE_URL` empty. The app clearly labels sample data and uses its demo adapter.
- **Live API mode:** set `VITE_API_BASE_URL=http://localhost:4000`, start the server, and create an account. Catalog, ratings, profile, personal lists, planner, notes/drafts, notifications, conversations, and contribution workflows use the API adapters.
- **Current stack:** React 18, TypeScript, Vite, React Router, `lucide-react`; Node.js 22.13+ and built-in SQLite on the server.
- **Priority:** normalized Importance (4/9), Exam relevance (3/9), and Interview relevance (2/9). Difficulty is reported separately and does not affect Priority. Confidence is independent.
- **Student helper profiles:** the API provides opt-in public profile details, database-derived published contribution statistics, a paginated public contribution feed, and persisted helpful votes. Private data and unpublished work are not exposed publicly.
- **Account model:** Junior, Senior and Candidate are chosen independently at registration. Semester is a separate field. Semester 3+ students of any account category may opt into Connect & Ask by enabling both availability and public-profile visibility.
- **Connect & Ask:** discover opted-in helpers by ID/name/branch/subject, view helper profiles, ask one student, or use Ask Everyone in either separate private conversations or one disclosed shared discussion.
- **Authentication UI:** login, sign-up, reset and password-change fields have accessible show/hide controls.
- **Removal safety:** personal-list, saved-topic, note, planner, draft and relationship removal flows use confirmation and/or a time-limited Undo action as appropriate.
- **CSRF multi-tab handling:** if another tab changes the shared browser session to a different account, a stale tab is told to reload rather than retrying a write under the other account's cookie.
- **Verification:** current saved source backend suite passed 42 tests in this environment. The latest project was not fully installed in this environment, so frontend Vitest and production build must be rerun on the developer Mac after extracting the supplied implementation ZIP. User's last local baseline before this implementation was 27/27 frontend tests and a successful Vite build.

The milestone notes below are retained as project history. Some statements inside those older notes describe earlier milestones and are superseded by the current project status above and the current API specification.

---

# StudyPrior (Frontend, Milestone 01)

**Study Smart, Not Hard.** Student-to-student academic priorities: students share ratings and academic guidance across independently selected account categories.

> Milestone 01 is frontend-only. All data is **demo data** held in memory; nothing is sent anywhere.

## Stack
React 18, TypeScript, Vite, React Router, lucide-react icons, plain CSS design system (semantic CSS variables, light/dark/system).

## Prerequisites
Node.js 18+ and npm.

## Commands
```bash
npm install
npm run dev      # development server
npm run build    # type-check (tsc) + production build into dist/
npm run preview  # serve the production build
```

## Historical Milestone 01 structure (frontend prototype)
```
src/
  types/       TypeScript entities
  data/        mock data (kept out of components)
  services/    api.ts: StudyPriorApi contract + mock implementation (swap for HTTP in Milestone 02)
  lib/         priority score, confidence, academic-year and helper-eligibility rules
  context/     Store: app state, theme persistence, local-only actions
  components/  Shell, TopicCard, ui kit
  pages/       Overview, Explore, Subjects, Saved, Planner, Seniors, Share, Messages,
               Notifications, Profile, Auth (login/register/forgot), Admin, NotFound
  styles.css   design tokens and layout
```

## Historical Milestone 01 prototype scope
Student dashboard, topic explore/search/filter/detail, subject selection, saved topics, study planner, Connect & Ask helper directory, share-experience form (validation, one rating per topic, edit), private and shared Ask Everyone conversations, messages, notifications, profile/settings, auth screens, admin preview (users, branches, semesters, subjects, units, topics, ratings, contributions, reports, settings, profile), theme switcher, responsive layout, 404 page.

## Demo-only (needs backend)
Authentication, registration, password reset/change, message delivery, persistence of all data except the theme, catalog edits in Admin, report moderation, role enforcement, and the study streak value.
Client-side checks are **not** security: the backend enforces roles, one-rating-per-user-per-topic, selected account category, helper eligibility, and ownership.

## Current product rules
Priority score = normalized Importance (4/9), Exam relevance (1/3), and Interview relevance (2/9), scaled to 0-100. Difficulty is independent and does not affect Priority. Confidence is calculated separately from the sample count. Thresholds: >=85 Must Study, >=70 High Priority, >=50 Medium, else Low. Fewer than 3 ratings = Limited data. Semester determines academic year only (1-2 first, 3-4 second, 5-6 third, 7-8 final); it never determines Junior/Senior/Candidate category. See `src/lib/priority.ts` and `server/src/domain/priority.mjs`.

## Current milestone
Milestone 4: comprehensive unit, integration, security, performance/load and data-integrity testing; database query review; alpha feedback and evidence-based recommendation refinement.

## M4 implementation batch 01 — Connect & Ask and account/security UX

- **Account categories:** Junior, Senior and Candidate are selected independently at registration. Semester is a separate field and only drives academic-year display and helper eligibility. The old semester-to-category mapping is not used by current account logic.
- **Connect & Ask:** any student in semester 3 or above may opt in by enabling both availability and public-profile visibility, regardless of account category. The helper directory supports student-ID/name/branch/subject search and public helper profiles.
- **Ask Everyone:** the asker chooses either separate private one-to-one conversations or one shared discussion. Shared mode clearly warns that participants can read all group messages; backend group membership protects reads, sends and read-state changes.
- **Ratings:** summary and feedback filters distinguish Junior, Senior and Candidate categories while preserving an overall community summary.
- **Password visibility:** the accessible eye control is shared by login, registration, reset and change-password inputs; passwords remain hidden by default.
- **Removal safety:** personal-list, saved-topic, planner, note, draft and graph-relationship removal flows use confirmation where appropriate and offer a seven-second Undo toast. Removing a personal subject never deletes the shared catalog record.
- **CSRF tab handling:** writes refresh a stale token once for the same account; if another tab has switched the shared session to a different account, the stale tab refuses to retry the write and instructs the user to reload.
- **Verification:** server tests were run after this batch; see `docs/m4-implementation-batch-01.md`. Frontend Vitest and production build must still be rerun locally after installing dependencies because this authoring environment did not have `node_modules`.

## UI restyle (reference screenshots)
Design tokens and the restyle live at the end of `src/styles.css` ("Restyle v2"). Overview, Profile and Share Experience follow the supplied screenshots; other pages inherit the same tokens. Extra routes (Subjects, Seniors, Messages, Notifications, Admin) are reachable from the header "more" menu so the sidebar stays as in the reference. The sidebar shows the selected account category; semester is displayed separately and only determines academic year/helper eligibility.

## Restyle (visual pass)
UI restyled to match the reference screenshots: 315px sidebar (More menu holds Subjects, Seniors, Messages, Notifications, Admin preview and the theme switch), large search header, stat cards, priority table, profile form, star-rating Share Experience page. Design tokens live at the top of `src/styles.css`. Profile role, semester and email stay read-only by design. 'Add topic' on Share Experience is disabled until the backend supports topic suggestions.

## Milestone 03 (enhancements)
- **Theme transition:** choosing Light/Dark/System spreads a soft circular reveal outward from the clicked option (View Transitions API, CSS clip-path). Browsers without it get a short colour fade; same-look switches and `prefers-reduced-motion` switch instantly. Theme still persists in `localStorage` (`studyprior-theme`); an inline script in `index.html` prevents a flash on load.
- **Micro-interactions:** shared 160 ms hover/focus/selected states for navigation, buttons, chips, cards, table rows, stars and inputs (see the end of `src/styles.css`).
- **Add subject:** `+ Add subject` on Overview and Subjects opens a modal: pick from the catalog (filter by branch/semester, duplicates blocked) or suggest a new subject. Suggestions are Pending, private to the user, and never change the shared catalog; admin approval needs the backend. Works for Junior, Senior and Candidate alike. Personal-list removal asks for confirmation and can be undone for a short time.
- **Ratings for all students:** Junior, Senior and Candidate students can rate (one per topic, editable). Each rating stores the contributor's selected account category; Candidate ratings have their own category summary and are also included in the overall community summary. Topic cards have **Rate this topic**.
- **Profile/registration fields:** registration includes independently selected account category (Junior/Senior/Candidate) and current semester. Current academic year is derived from semester only. Legacy accounts receive a one-time profile prompt to confirm their category after the v4 migration; new accounts select it at registration.
- **Still demo-only / frontend-only:** no backend or migrations exist in this project, so the one-rating-per-topic rule, pending-subject approval and academic progression are enforced only on the client. The backend milestone must enforce them. Run `npm install && npm run build` and `npm test` (Vitest) locally.

## Milestone 04 (interactive workflows)
- **Dashboard arrows:** the arrow on each stat card is a real link with an accessible label: Subjects -> `/subjects`, Important Topics -> `/explore?level=Important` (Must Study + High Priority with enough ratings), Saved Topics -> `/saved`, Study Streak -> `/planner?focus=streak`. The destination slides in (about 240 ms, CSS only); `prefers-reduced-motion` removes the movement.
- **Planner:** each item has an optional Study purpose (8 defaults plus a validated custom text) shown as a badge; filters by status, date and purpose; edit dialog; private notes via the note icon. Legacy items without a purpose still work.
- **Notes:** private, per user, on Subjects (note icon / subject page) and Planner items. Never shown as advice or ratings.
- **Add subject vs create subject:** "Add subject" picks existing catalog subjects (multi-select, duplicates blocked) and only changes your personal list. "Can't find your subject?" opens a 3-step wizard (details with duplicate suggestions, topics with units, review) with Save draft, Back, Cancel and Publish for feedback.
- **Honest saving:** publishing a subject and submitting a rating go through `src/services` and the UI shows success only after the API (or demo adapter) confirms. Failures show an error and keep your input. With `VITE_API_BASE_URL` set, the catalog, subject publishing and ratings use the HTTP adapter (contract in `docs/api-contract.md`); without it, demo mode stores them on this device and says so. Add `?demoFail=1` to the URL to see the failure state in demo mode.
- **Ratings:** any student (Junior or Senior) can rate; one rating per topic, editable.
- **Back buttons:** shown on interior pages; uses history when the previous page is in-app, otherwise a parent route; warns before discarding unsaved changes.
- **Tests:** `npm test` (Vitest) covers purposes, duplicate detection, draft validation and both service adapters. See Limitations: the HTTP adapter has not been run against a real backend because none exists yet.
- **Add topic to an existing subject:** the "+ Add topic" link on Share experience (after choosing a subject) and the "+ Add topic" button on a subject page add one topic and, on Share, select it so you can rate it straight away. It uses the same honest-save rule: the topic only appears after the API confirms.

## Milestone 05 (subject and topic profiles)
- **Routes:** `/subjects/:id` (Subject Profile) and `/topics/:topicId` (Topic Profile). Subject and topic names link to them from Overview, Explore cards, Saved topics, Planner, Subjects and each other. Back uses history, otherwise the parent subject (topic) or My Subjects (subject); breadcrumbs link up the chain.
- **Subject Profile:** header with status and actions (add/remove My Subjects, add topic, add note), description kept separate from student advice, units and topics with a filter, per-topic score/level/rating count/confidence, strongest-consensus and limited-data lists, recurring words from real advice (community themes, not facts), and an at-a-glance panel.
- **Topic Profile:** priority score only when ratings exist ("No ratings yet." otherwise, "Limited data" under 3), per-dimension mean, vote count and 1-5 star distribution with percentages (accessible progress bars, denominator stated), a side panel of totals, and **What students say**: contributor, level and branch (only if the contributor is public), the dimensions they rated, advice, common mistake and date, with sort by recent / importance / exam / interview, an account-category filter (Junior, Senior or Candidate) and a "written advice only" filter. Your own rating is marked and links to Edit.
- **Definitions** are in `docs/api-contract.md` and `src/lib/stats.ts` (tested in `src/lib/stats.test.ts`).
- **Demo data:** in demo mode the contributors and their ratings are labelled "Sample data". They are fixtures, not real students.
- **Not done:** user-facing report/flag buttons (the app has no such flow yet), contributor public-profile links (no route exists), and server-side aggregation (no backend). Ratings still use the existing Share page, which creates or updates your one rating per topic.

---

# Backend (Milestone 02: foundation + accounts)

Express + TypeScript + PostgreSQL (Prisma). Code in `backend/`, docs in `docs/` (`architecture.md`, `data-model.md`, `api-spec.md`, `frontend-integration.md`).

## What exists
Health check, secure register/login/logout/me, profile read/update, server-side academic level, 13-table schema with constraints, the canonical priority/confidence service, rate limiting, CSRF protection, a development seed and an admin CLI. **Not yet built:** catalog, rating, planner and notes endpoints (documented as planned in `docs/api-spec.md`) and frontend wiring (`docs/frontend-integration.md`).

## Run it locally (beginner steps)
Requirements: Node 20+, Docker (for PostgreSQL), npm.
```bash
# 1. Start PostgreSQL (creates the studyprior and studyprior_test databases)
cp .env.example .env            # then edit .env and set POSTGRES_PASSWORD
export $(grep POSTGRES_PASSWORD .env | xargs)
docker compose up -d            # stop later with: docker compose down  (add -v to delete the data)

# 2. Configure and install the backend
cd backend
cp .env.example .env            # fill in CHANGE_ME (same password) and SESSION_SECRET (see the comment in the file)
npm install

# 3. Create the tables, add development data, start the API
npm run migrate:dev             # applies prisma/migrations (see "Migrations" below)
SEED_USER_PASSWORD='choose-a-dev-password' npm run seed     # optional fictional dev data (refuses in production)
npm run dev                     # http://localhost:4000/api/v1/health

# 4. Run the frontend (separate terminal, project root)
npm install && npm run dev      # http://localhost:5173
```
Create the first admin (never possible through public registration):
`ADMIN_EMAIL=you@example.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='a-long-passphrase' npm run admin:create` (run inside `backend/`).

## Tests and builds
```bash
cd backend
npm run test:unit    # pure rules: priority formula, levels, years, streak (no database)
npm run test:int     # applies migrations to studyprior_test, then API + database tests (needs PostgreSQL running)
npm run typecheck && npm run build
```

## Migrations (hand-written: verify before trusting)
Historical PostgreSQL prototype migration notes follow; the active application uses the SQLite migrations in `server/src/db.mjs` (currently schema version 4). They were written by hand, so check them against the Prisma schema. Safe, non-destructive steps:
```bash
cd backend
npm install                      # also creates package-lock.json: commit it
npm run prisma:validate          # schema syntax
npm run db:check-sync            # no database needed: static schema-vs-SQL comparison (already passes)
docker compose exec db createdb -U studyprior studyprior_shadow   # only if your database volume existed before; new volumes create it automatically
npm run db:check-drift           # replays migrations in the SHADOW db and diffs with schema.prisma. Exit 0 = identical, 2 = drift
npm run migrate:deploy           # applies pending migrations additively to your dev database
```
**Never run `prisma migrate reset` or `docker compose down -v` on a database you want to keep:** both delete every table and row. If you need either, take a backup first (`pg_dump -U studyprior -Fc studyprior > backup.dump`). If `db:check-drift` reports drift, do not edit migrations that were already applied anywhere; add a new migration instead.

## Verification status
See `docs/verification-report.md` for exactly what has and has not been run. In short: the pure rules and the static migration check were run; install, type-check with real types, Prisma, migrations, integration tests and the build could not be run in the authoring environment (no network, no PostgreSQL). `typescript` is pinned to `~5.6.3`; a newer global TypeScript (6+) warns about `moduleResolution: node`, so use the project's own `npm run typecheck`.

---

# Frontend refinements (latest)
- **Add a new subject** now lives only on **Share experience** (link beside the Subject field). The old "Create a new subject" link was removed from the My Subjects add-subject dialog; My Subjects has no creation button (it still lists drafts, with Resume). The wizard (details, topics, review, publish for feedback) is unchanged except for its name, its Back/Cancel destination (Share experience) and where it lands afterwards: a *published* subject opens the rating form for its first topic; a subject *pending review* opens its profile and cannot be rated until it is approved. Route: `/subjects/new`.
- **Profile:** clicking the avatar opens a menu with **View profile** (`/profile`, read-only) and **Edit profile** (`/profile/edit`). Editable: display name, department, branch, college, enrollment year, expected graduation year, bio, availability. Not editable: email, system role, confirmed account category, and semester. Account category is selected independently at registration (legacy accounts can confirm it once); semester remains separate. Helper availability is available from semester 3 onward for every account category. Saving shows a loading state, validates, and reports failures honestly (your input is kept; success is shown only after the API layer confirms). Cancel and Back ask before discarding changes.
- **Theme:** only Light and Dark. New users start in Light; a saved Light/Dark choice is respected; a legacy saved "System" value is converted once to whatever the OS preferred. The circular reveal transition is unchanged. Colour fixes made after a contrast check: light warning/streak text, input placeholder, dark-mode active navigation.
- **Dashboard subtitle:** now uses a dedicated colour (dark muted purple in Light, soft lavender-gray in Dark) and rotates between three messages, one per dashboard visit, in order. It does not change while the page is open and its small fade-in is disabled under reduced-motion.
- **Run the checks:** `npm install && npm run build && npm test`. See `docs/refinement-verification.md` for what has and has not been run, and `docs/frontend-integration.md` for the remaining backend wiring.

## Welcome subtitle typography
The line under "Welcome back" on the dashboard uses Lora Italic (one weight, loaded with `font-display: swap` from Google Fonts in `index.html`; Georgia italic is used if the font is unavailable or offline). Colours: Light `#7766A7` (4.56:1 on the page background; `#9183B8` measured 3.15:1 and was too faint for readable text), Dark `#B8ADC9` (8.8:1). The existing fade-in was refined in place (slightly longer and softer) and is disabled under `prefers-reduced-motion`. To avoid the Google Fonts request, self-host Lora Italic and replace the two `<link>` tags with an `@font-face` rule.

## Branding (logo + theme)
The logo is the `LogoMark` SVG component in `src/components/ui.tsx` (also the favicon in `index.html`). The theme follows its colours: navy `#0e1630`, amber `#e8a33c`, cream `#f9f8f3`. Tokens are at the top of `src/styles.css` (light: navy accent; dark: amber accent). Status colours are unchanged.


## M4 Implementation Batch 02

Batch 02 adds server-backed Sent/Delivered/Seen receipts for direct messages and per-helper partial receipts for Ask Everyone shared discussions, plus unread notification/direct-message/shared-discussion navigation badges. SQLite schema migration v5 is additive. The existing 10-second visible-tab polling model remains; this release does not claim WebSocket or push delivery. See `docs/m4-implementation-batch-02.md` and the updated consolidated tracker for verification results and rollout precautions.
