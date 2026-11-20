# Connecting the frontend to the backend

**Status:** the full frontend source is in this project, but it is **not yet connected** to this milestone's API. It still runs in demo mode unless `VITE_API_BASE_URL` is set. Please leave that variable empty until the next backend milestone: the catalog, rating and subject-publishing endpoints the screens need do not exist yet, so pointing the app at the backend today would only show honest "couldn't load" errors.

## What already matches
- Demo-only controls: the "simulate failure" hook (`?demoFail=1`) now works only in development builds (`import.meta.env.DEV`).
- The frontend's local priority/confidence code (`src/lib/priority.ts`) was aligned with the canonical rules: new score formula (difficulty excluded) and labels Limited data / Early signal / Broader community signal. When the API is connected, display the server's values instead of recomputing.
- `credentials: 'include'` is already used by the HTTP adapter (`src/services/api.ts`).

## Added in the frontend refinement pass
- `updateProfile` exists in the API layer. In demo mode it saves on this device (labelled). With `VITE_API_BASE_URL` set it sends **`PATCH /api/v1/profile`** (fields: name, department, branch, college, enrollmentYear, graduationYear, bio, availableForQuestions) with `credentials: 'include'` and, when set, `X-CSRF-Token`. Role, level, semester, email and password are never sent. Until sign-in is wired up the server answers 401, which the UI shows as "Not saved"; it never shows success.
- `setCsrfToken(token)` (exported from `src/services/api.ts`) keeps the anti-CSRF token in memory only. Call it with the `csrfToken` returned by `/auth/login`, `/auth/register` or `/auth/me`.

## Adapter work still to do (next milestone)
0. **Refinement leftovers:** (a) wire sign-in so `getUser()` loads `/auth/me` instead of demo data and call `setCsrfToken`; (b) the **theme preference is stored only in this browser** (`localStorage`); after sign-in send `themePreference: 'LIGHT' | 'DARK'` with `PATCH /profile` (the backend enum still contains SYSTEM, which the UI no longer offers; remove it with a migration when convenient); (c) the department and branch lists are demo constants and should come from the server catalog/settings; (d) the Add a new subject workflow still posts to the legacy path `POST /api/subjects`; the real endpoint is `POST /api/v1/subjects` (planned, `docs/api-spec.md`); (e) semester cannot be edited by students (the backend rejects it), so the form shows it read-only.
1. **Paths:** change `/api/...` to `/api/v1/...`; replace `GET /api/catalog` with the planned subjects/topics endpoints (see `docs/api-spec.md`).
2. **Auth:** add `register/login/logout/me` calls; keep the `csrfToken` from the response in memory and send it as `X-CSRF-Token` on every POST/PATCH/PUT/DELETE; load `/auth/me` on startup and guard protected routes without flashing content.
3. **Senior-only breakdown:** show `overall` and `senior` side by side from the API; show "No senior ratings yet." when the senior sample is empty.
4. **Registration/profile forms:** they already collect department, branch, college, enrollment year, graduation year and semester. Do not add any role or level selector; show the server-derived `academicLevel`.
5. **Production:** remove reliance on local demo storage for plans/notes/drafts once their endpoints exist; never fall back to fake data when the API is down.

## Configuration
- Frontend `.env`: `VITE_API_BASE_URL=http://localhost:4000` (later).
- Backend `backend/.env`: `FRONTEND_ORIGIN=http://localhost:5173`. CORS allows only that origin, with credentials.
