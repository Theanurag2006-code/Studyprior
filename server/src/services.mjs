import { newId, hashToken, newToken, newCsrf } from './lib/crypto.mjs';
import { nowIso, tx } from './db.mjs';
import { DEFAULT_SETTINGS } from './domain/academic.mjs';
import { q } from './dto.mjs';

export const getSettings = db => { const r = q.get(db, 'SELECT max_semester FROM academic_settings WHERE id = 1'); return r ? { maxSemester: r.max_semester, helperMinSemester: DEFAULT_SETTINGS.helperMinSemester } : DEFAULT_SETTINGS; };
export function createSession(db, config, userId) {
  const token = newToken(); const csrf = newCsrf(); const now = Date.now();
  q.run(db, 'INSERT INTO sessions (id, token_hash, user_id, csrf, expires_at, created_at) VALUES (?,?,?,?,?,?)', newId(), hashToken(token, config.secret), userId, csrf, now + config.sessionTtlMs, now);
  return { token, csrf };
}
export const sessionCookie = (config, token) => `sp_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=${config.sameSite}; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}${config.cookieSecure ? '; Secure' : ''}`;
export const clearCookie = config => `sp_session=; Path=/; HttpOnly; SameSite=${config.sameSite}; Max-Age=0${config.cookieSecure ? '; Secure' : ''}`;
/** One notification per (user, ref) stays unread and is refreshed, so a busy chat doesn't flood the bell. */
export function notify(db, userId, text, link, ref = null) {
  const ex = ref ? q.get(db, 'SELECT id FROM notifications WHERE user_id = ? AND ref = ? AND read = 0', userId, ref) : null;
  if (ex) q.run(db, 'UPDATE notifications SET text = ?, created_at = ? WHERE id = ?', text, nowIso(), ex.id);
  else q.run(db, 'INSERT INTO notifications (id, user_id, text, link, read, created_at, ref) VALUES (?,?,?,?,0,?,?)', newId(), userId, text, link, nowIso(), ref);
}
/** Visible subjects: published ones, plus your own pending ones (admins see everything). */
export const visibleSubjectSql = u => (u.role === 'ADMIN' ? '1=1' : `(status = 'PUBLISHED' OR created_by = ${Number(u.id)})`);
export const findVisibleSubject = (db, u, id) => q.get(db, `SELECT * FROM subjects WHERE id = ? AND ${visibleSubjectSql(u)}`, id);
export const findVisibleTopic = (db, u, id) => q.get(db, `SELECT t.* FROM topics t JOIN subjects s ON s.id = t.subject_id WHERE t.id = ? AND ${visibleSubjectSql(u).replaceAll('status', 's.status').replaceAll('created_by', 's.created_by')}`, id);
export { tx };
