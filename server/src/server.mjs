import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { openDb } from './db.mjs';
import { createApp, Router } from './http.mjs';
import { register as auth } from './routes/auth.mjs';
import { register as catalog } from './routes/catalog.mjs';
import { register as me } from './routes/me.mjs';
import { register as social } from './routes/social.mjs';
import { register as admin } from './routes/admin.mjs';
import { register as seniors } from './routes/seniors.mjs';
import { register as relationships } from './routes/relationships.mjs';

/** Builds a ready-to-listen app. Tests call this with an in-memory database. */
export function build(overrides = {}) {
  const config = loadConfig(process.env, overrides); const db = openDb(config.dbPath); const router = new Router();
  for (const reg of [auth, catalog, me, social, seniors, relationships, admin]) reg(router);
  const sweep = setInterval(() => { try { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()); db.prepare('DELETE FROM reset_tokens WHERE expires_at < ?').run(Date.now()); } catch { /* db closed */ } }, 3600_000); sweep.unref();
  const app = createApp({ config, db, router });
  return { ...app, config, db, close: async () => { clearInterval(sweep); await app.close(); db.close(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { server, config } = build();
  server.listen(config.port, () => console.log(`StudyPrior API listening on http://localhost:${config.port}  (frontend origin allowed: ${config.origin}, database: ${config.dbPath})`));
  const stop = () => server.close(() => process.exit(0)); process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
