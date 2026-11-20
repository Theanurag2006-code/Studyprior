# StudyPrior server

A small, dependency-free API (Node 22.13+ with its built-in SQLite). No `npm install` is needed.

```bash
cd server
npm start          # http://localhost:4000/api/v1/health
npm test           # 30 tests against the real server with an in-memory database
npm run e2e        # the frontend's own API code vs this server (needs internet once, for the "tsx" helper)
SEED_PASSWORD='demo-password-123' npm run seed                      # optional fictional demo data
ADMIN_EMAIL=you@example.com ADMIN_NAME="You" ADMIN_PASSWORD='a-long-passphrase' npm run admin:create
```
See `../docs/running-locally.md` for the full walkthrough and `../docs/api-spec.md` for every endpoint.
