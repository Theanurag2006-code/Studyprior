import { createServer as createHttp } from 'node:http';
import { ApiError, forbidden, unauthorized } from './lib/errors.mjs';
import { hashToken, safeEqual } from './lib/crypto.mjs';

export const SESSION_COOKIE = 'sp_session';
/** Minimal router: patterns like /me/plans/:id. Handlers return data (sent as { data }) or call ctx.status(201). */
export class Router {
  constructor() { this.routes = []; }
  add(method, pattern, opts, handler) { const keys = []; const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$'); this.routes.push({ method, re, keys, opts, handler }); }
  match(method, path) { for (const r of this.routes) { if (r.method !== method) continue; const m = r.re.exec(path); if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; } return null; }
  pathExists(path) { return this.routes.some(r => r.re.test(path)); }
}
const limiterStore = new Map();
function limited(key, windowMs, max) { const now = Date.now(); const e = limiterStore.get(key); if (!e || e.reset < now) { limiterStore.set(key, { n: 1, reset: now + windowMs }); return false; } e.n++; return e.n > max; }
export const parseCookies = h => Object.fromEntries((h ?? '').split(';').map(s => s.trim()).filter(Boolean).map(s => { const i = s.indexOf('='); return [s.slice(0, i), decodeURIComponent(s.slice(i + 1))]; }));

export function createApp({ config, db, router, logger = console }) {
  const stmtSession = db.prepare('SELECT s.id sid, s.csrf, s.expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?');
  const send = (res, status, payload, extra = {}) => { const body = payload === undefined ? '' : JSON.stringify(payload); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), ...extra }); res.end(body); };
  const sec = origin => ({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    ...(origin ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', Vary: 'Origin' } : { Vary: 'Origin' }) });
  const readBody = req => new Promise((resolve, reject) => {
    const chunks = []; let size = 0; let tooBig = false;
    req.on('data', c => { size += c.length; if (size > 100_000) { tooBig = true; chunks.length = 0; if (size > 2_000_000) req.destroy(); } else if (!tooBig) chunks.push(c); }); // keep reading (and discarding) so the client can receive the 413 answer
    req.on('end', () => { if (tooBig) return reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')); if (!chunks.length) return resolve(undefined); try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON.')); } });
    req.on('error', reject);
  });
  const ip = req => (config.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';

  async function handle(req, res) {
    const started = Date.now(); const reqId = Math.random().toString(36).slice(2, 10); const url = new URL(req.url, 'http://localhost'); const path = url.pathname;
    const allowedOrigin = req.headers.origin && req.headers.origin === config.origin ? req.headers.origin : null; const headers = { ...sec(allowedOrigin), 'X-Request-Id': reqId };
    let status = 500;
    try {
      if (req.method === 'OPTIONS') { status = 204; res.writeHead(204, { ...headers, ...(allowedOrigin ? { 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE', 'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token', 'Access-Control-Max-Age': '600' } : {}) }); return res.end(); }
      if (!path.startsWith('/api/v1/')) throw new ApiError(404, 'NOT_FOUND', 'Route not found.');
      const m = router.match(req.method, path.slice('/api/v1'.length));
      if (!m) throw router.pathExists(path.slice('/api/v1'.length)) ? new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.') : new ApiError(404, 'NOT_FOUND', 'Route not found.');
      if (config.rateLimit && limited(`api:${ip(req)}`, 15 * 60_000, 900)) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.');
      const { route, params } = m; const { opts } = route;
      if (config.rateLimit && opts.limit && limited(`${opts.limit[0]}:${ip(req)}`, opts.limit[1], opts.limit[2])) throw new ApiError(429, 'RATE_LIMITED', opts.limit[3] ?? 'Too many attempts. Please wait and try again.');
      // ---- session
      let session = null; let user = null; const raw = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (raw) { const row = stmtSession.get(hashToken(raw, config.secret)); if (row && row.expires_at > Date.now()) { session = { id: row.sid, csrf: row.csrf }; user = row; } else if (row) db.prepare('DELETE FROM sessions WHERE id = ?').run(row.sid); }
      // ---- CSRF: foreign origins are refused, and signed-in state-changing requests must carry the session's token
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers.origin && req.headers.origin !== config.origin) throw forbidden('Cross-site request blocked.');
        if (session && !(req.headers['x-csrf-token'] && safeEqual(req.headers['x-csrf-token'], session.csrf))) throw forbidden('Missing or invalid CSRF token.');
      }
      if (opts.auth && !user) throw unauthorized();
      if (opts.auth === 'admin' && user.role !== 'ADMIN') throw forbidden('Administrator access required.');
      if (opts.auth === 'student' && user.role !== 'STUDENT') throw forbidden('This action is for student accounts.');
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) ? await readBody(req) : undefined;
      let outStatus = 200; const setCookies = [];
      const ctx = { req, res, params, query: Object.fromEntries(url.searchParams), body, user, session, db, config, ip: ip(req), status: s => { outStatus = s; }, setCookie: c => setCookies.push(c) };
      const data = await route.handler(ctx); status = outStatus;
      return send(res, status, status === 204 ? undefined : { data: data ?? null }, { ...headers, ...(setCookies.length ? { 'Set-Cookie': setCookies } : {}) });
    } catch (e) {
      const api = e instanceof ApiError ? e : null; status = api ? api.status : 500;
      if (!api) logger.error?.(`[${reqId}] unhandled ${e?.name}: ${e?.message}`); // never logs bodies, cookies or query strings
      return send(res, status, { error: { code: api ? api.code : 'INTERNAL_ERROR', message: api ? api.message : 'Something went wrong on our side. Please try again.', ...(api?.details ? { details: api.details } : {}), requestId: reqId } }, headers);
    } finally { if (!config.isTest) logger.log?.(`${req.method} ${path} -> ${status} ${Date.now() - started}ms`); }
  }
  const server = createHttp((req, res) => { handle(req, res).catch(() => { try { res.writeHead(500); res.end(); } catch { /* socket gone */ } }); });
  server.requestTimeout = 30_000; server.headersTimeout = 10_000; // slow or stalled clients cannot hold connections open
  return { server, close: () => new Promise(r => server.close(() => r())) };
}
