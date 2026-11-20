import { ApiError, forbidden, notFound } from '../lib/errors.mjs';
import { validator } from '../lib/validate.mjs';
import { newId } from '../lib/crypto.mjs';
import { nowIso, tx } from '../db.mjs';
import { HELPER_MIN_SEMESTER } from '../domain/academic.mjs';
import { levelLabel, q } from '../dto.mjs';
import { notify } from '../services.mjs';

const pair = (a, b) => (a < b ? [a, b] : [b, a]);
const isBlocked = (db, a, b) => !!q.get(db, 'SELECT 1 x FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)', a, b, b, a);
const recentMessages = (db, uid) => q.get(db, 'SELECT count(*) c FROM messages WHERE sender_id = ? AND created_at > ?', uid, new Date(Date.now() - 3600_000).toISOString()).c;
const MSG_PER_HOUR = 40, NEW_CONV_PER_DAY = 8;

/** Conversations from `user`'s point of view. `seniorId` is the OTHER person's public id (the frontend's field name). */
export function conversationsFor(db, user) {
  // The active app polls this endpoint. A message is Delivered once the recipient's signed-in app has fetched it.
  q.run(db, `UPDATE messages SET delivered_at = COALESCE(delivered_at, ?)
    WHERE sender_id <> ? AND delivered_at IS NULL
      AND conversation_id IN (SELECT id FROM conversations WHERE a_id = ? OR b_id = ?)`, nowIso(), user.id, user.id, user.id);
  const convs = q.all(db, 'SELECT * FROM conversations WHERE a_id = ? OR b_id = ? ORDER BY last_at DESC', user.id, user.id);
  return convs.map(c => {
    const other = q.get(db, 'SELECT * FROM users WHERE id = ?', c.a_id === user.id ? c.b_id : c.a_id);
    const msgs = q.all(db, 'SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 100) ORDER BY created_at ASC', c.id);
    return { id: c.id, seniorId: other.pid, peer: { id: other.pid, name: other.name, level: levelLabel(other.account_type ?? other.level) ?? 'Admin', branch: other.branch ?? other.department }, draft: '',
      unread: msgs.filter(m => m.sender_id !== user.id && !m.read_at).length, blocked: isBlocked(db, user.id, other.id),
      messages: msgs.map(m => ({ id: m.id, from: m.sender_id === user.id ? 'me' : 'them', text: m.body, at: m.created_at,
        ...(m.sender_id === user.id ? { deliveryStatus: m.read_at ? 'SEEN' : m.delivered_at ? 'DELIVERED' : 'SENT' } : {}) })) };
  });
}
const sendMessage = (db, conv, user, other, text) => tx(db, () => {
  const id = newId(); const now = nowIso(); q.run(db, 'INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?,?,?,?,?)', id, conv.id, user.id, text, now);
  q.run(db, 'UPDATE conversations SET last_at = ? WHERE id = ?', now, conv.id);
  notify(db, other.id, `New message from ${user.name}`, `/messages/${conv.id}`, `conv:${conv.id}`); return id;
});

export function register(r) {
  r.add('GET', '/me/conversations', { auth: true }, ({ db, user }) => conversationsFor(db, user));

  // Ask everyone supports two explicit delivery modes: isolated one-to-one threads or one opt-in shared discussion.
  r.add('POST', '/ask-everyone', { auth: 'student', limit: ['ask-everyone', 86_400_000, 3, 'You have sent several Ask Everyone requests today. Please try again tomorrow.'] }, ({ body, db, user, status }) => {
    const v = validator(body); const text = v.text('text', { min: 5, max: 1000 }); const mode = v.oneOf('mode', ['PRIVATE', 'GROUP']); v.done();
    if (user.semester < 1) throw forbidden('Your academic profile is incomplete.');
    const helpers = q.all(db, `SELECT * FROM users WHERE role='STUDENT' AND semester >= ${HELPER_MIN_SEMESTER} AND available=1 AND public_profile=1 AND id <> ? ORDER BY name`, user.id)
      .filter(h => !isBlocked(db, user.id, h.id));
    if (!helpers.length) throw new ApiError(409, 'NO_AVAILABLE_HELPERS', 'No students are currently available to help.');
    if (helpers.length > 20) throw new ApiError(413, 'TOO_MANY_RECIPIENTS', 'There are too many available helpers for one request. Please contact individual helpers instead.');

    if (mode === 'PRIVATE') {
      const created = tx(db, () => helpers.map(other => {
        const [a, b] = pair(user.id, other.id); let conv = q.get(db, 'SELECT * FROM conversations WHERE a_id = ? AND b_id = ?', a, b);
        if (!conv) { const id = newId(); q.run(db, 'INSERT INTO conversations (id, a_id, b_id, created_at, last_at) VALUES (?,?,?,?,?)', id, a, b, nowIso(), nowIso()); conv = q.get(db, 'SELECT * FROM conversations WHERE id = ?', id); }
        const messageId = newId(); const now = nowIso();
        q.run(db, 'INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?,?,?,?,?)', messageId, conv.id, user.id, text, now);
        q.run(db, 'UPDATE conversations SET last_at=? WHERE id=?', now, conv.id);
        notify(db, other.id, `New question from ${user.name}`, `/messages/${conv.id}`, `conv:${conv.id}`);
        return conv.id;
      }));
      status(201); return { mode, deliveredTo: created.length, conversationIds: created };
    }

    const groupId = newId(); const now = nowIso();
    tx(db, () => {
      q.run(db, 'INSERT INTO ask_groups (id, asker_id, question, created_at, last_at) VALUES (?,?,?,?,?)', groupId, user.id, text, now, now);
      q.run(db, 'INSERT INTO ask_group_members (group_id, user_id, member_type, joined_at, last_read_at) VALUES (?,?,?,?,?)', groupId, user.id, 'ASKER', now, now);
      for (const helper of helpers) {
        q.run(db, 'INSERT INTO ask_group_members (group_id, user_id, member_type, joined_at, last_read_at) VALUES (?,?,?,?,?)', groupId, helper.id, 'HELPER', now, null);
        notify(db, helper.id, `${user.name} asked a question in a shared discussion`, `/ask-groups/${groupId}`, `ask-group:${groupId}`);
      }
      const messageId = newId();
      q.run(db, 'INSERT INTO ask_group_messages (id, group_id, sender_id, body, created_at) VALUES (?,?,?,?,?)', messageId, groupId, user.id, text, now);
      for (const helper of helpers) q.run(db, 'INSERT INTO ask_group_message_receipts (message_id, recipient_id) VALUES (?,?)', messageId, helper.id);
    });
    status(201); return { mode, groupId, deliveredTo: helpers.length };
  });

  const groupMember = (db, user, groupId) => {
    const member = q.get(db, 'SELECT * FROM ask_group_members WHERE group_id=? AND user_id=?', groupId, user.id);
    if (!member) throw notFound('Discussion not found.');
    const group = q.get(db, 'SELECT * FROM ask_groups WHERE id=?', groupId);
    if (!group) throw notFound('Discussion not found.');
    return { member, group };
  };
  const groupList = (db, user) => {
    // Listing group metadata does not count as delivery: the message body is only fetched from GET /ask-groups/:id.
    return q.all(db, `SELECT g.id, g.question, g.created_at, g.last_at, g.asker_id, m.member_type, asker.pid asker_pid, asker.name asker_name,
      (SELECT count(*) FROM ask_group_members gm WHERE gm.group_id=g.id) member_count,
      (SELECT count(*) FROM ask_group_messages gm WHERE gm.group_id=g.id AND gm.sender_id<>? AND gm.created_at>COALESCE(m.last_read_at,'')) unread
    FROM ask_group_members m JOIN ask_groups g ON g.id=m.group_id JOIN users asker ON asker.id=g.asker_id
    WHERE m.user_id=? ORDER BY g.last_at DESC`, user.id, user.id).map(g => ({ id: g.id, question: g.question, createdAt: g.created_at, lastAt: g.last_at, asker: { id: g.asker_pid, name: g.asker_name }, memberType: g.member_type, memberCount: g.member_count, unread: g.unread }));
  };
  r.add('GET', '/me/ask-groups', { auth: true }, ({ db, user }) => groupList(db, user));
  r.add('GET', '/ask-groups/:id', { auth: true }, ({ params, db, user }) => {
    const { group } = groupMember(db, user, params.id);
    q.run(db, `UPDATE ask_group_message_receipts SET delivered_at = COALESCE(delivered_at, ?)
      WHERE recipient_id = ? AND delivered_at IS NULL AND message_id IN (SELECT id FROM ask_group_messages WHERE group_id = ?)`, nowIso(), user.id, group.id);
    const members = q.all(db, `SELECT u.pid id, u.name, u.account_type, u.semester, m.member_type memberType FROM ask_group_members m JOIN users u ON u.id=m.user_id WHERE m.group_id=? ORDER BY CASE m.member_type WHEN 'ASKER' THEN 0 ELSE 1 END, u.name`, group.id)
      .map(m => ({ id: m.id, name: m.name, accountType: levelLabel(m.account_type) ?? 'Junior', semester: m.semester, memberType: m.memberType }));
    const messages = q.all(db, `SELECT m.id, m.sender_id, m.body, m.created_at, u.pid sender_pid, u.name sender_name,
        (SELECT count(*) FROM ask_group_message_receipts r WHERE r.message_id=m.id) recipient_count,
        (SELECT count(*) FROM ask_group_message_receipts r WHERE r.message_id=m.id AND r.delivered_at IS NOT NULL) delivered_count,
        (SELECT count(*) FROM ask_group_message_receipts r WHERE r.message_id=m.id AND r.read_at IS NOT NULL) seen_count
      FROM ask_group_messages m JOIN users u ON u.id=m.sender_id WHERE m.group_id=? ORDER BY m.created_at ASC LIMIT 300`, group.id)
      .map(m => {
        let deliveryStatus;
        if (m.sender_id === user.id && m.recipient_count > 0) {
          if (m.seen_count === m.recipient_count) deliveryStatus = 'SEEN';
          else if (m.seen_count > 0) deliveryStatus = 'PARTIAL_SEEN';
          else if (m.delivered_count === m.recipient_count) deliveryStatus = 'DELIVERED';
          else if (m.delivered_count > 0) deliveryStatus = 'PARTIAL_DELIVERED';
          else deliveryStatus = 'SENT';
        }
        return { id: m.id, senderId: m.sender_pid, senderName: m.sender_name, mine: m.sender_id === user.id, text: m.body, at: m.created_at,
          ...(deliveryStatus ? { deliveryStatus, recipientCount: m.recipient_count, deliveredCount: m.delivered_count, seenCount: m.seen_count } : {}) };
      });
    const asker = q.get(db, 'SELECT pid, name FROM users WHERE id=?', group.asker_id);
    return { id: group.id, question: group.question, createdAt: group.created_at, lastAt: group.last_at, asker: { id: asker.pid, name: asker.name }, members, messages, memberType: q.get(db, 'SELECT member_type FROM ask_group_members WHERE group_id=? AND user_id=?', group.id, user.id).member_type };
  });
  r.add('POST', '/ask-groups/:id/messages', { auth: true, limit: ['ask-group-message', 3600_000, 40] }, ({ params, body, db, user, status }) => {
    const { group } = groupMember(db, user, params.id); const v = validator(body); const text = v.text('text', { min: 1, max: 1000 }); v.done();
    const id = newId(); const now = nowIso();
    tx(db, () => { q.run(db, 'INSERT INTO ask_group_messages (id, group_id, sender_id, body, created_at) VALUES (?,?,?,?,?)', id, group.id, user.id, text.trim(), now); q.run(db, 'UPDATE ask_groups SET last_at=? WHERE id=?', now, group.id);
      const recipients = q.all(db, 'SELECT user_id FROM ask_group_members WHERE group_id=? AND user_id<>?', group.id, user.id);
      for (const r of recipients) {
        q.run(db, 'INSERT INTO ask_group_message_receipts (message_id, recipient_id) VALUES (?,?)', id, r.user_id);
        notify(db, r.user_id, `New reply in a shared academic discussion`, `/ask-groups/${group.id}`, `ask-group:${group.id}`);
      }
    });
    status(201); return { id, text: text.trim(), at: now, senderId: user.pid, senderName: user.name, mine: true };
  });
  r.add('POST', '/ask-groups/:id/read', { auth: true }, ({ params, db, user }) => {
    const { group } = groupMember(db, user, params.id); const now = nowIso();
    q.run(db, 'UPDATE ask_group_members SET last_read_at=? WHERE group_id=? AND user_id=?', now, group.id, user.id);
    q.run(db, `UPDATE ask_group_message_receipts SET delivered_at=COALESCE(delivered_at, ?), read_at=COALESCE(read_at, ?)
      WHERE recipient_id=? AND message_id IN (SELECT id FROM ask_group_messages WHERE group_id=? AND sender_id<>?)`, now, now, user.id, group.id, user.id);
    q.run(db, 'UPDATE notifications SET read=1 WHERE user_id=? AND ref=?', user.id, `ask-group:${group.id}`); return { read: true };
  });

  // Starting a conversation sends the first message. The editable starter text stays a draft in the browser until the person presses Send.
  r.add('POST', '/conversations', { auth: 'student', limit: ['conv', 86_400_000, 30, 'Too many new conversations today. Please try again tomorrow.'] }, ({ body, db, user, status }) => {
    const v = validator(body); const seniorId = v.str('seniorId', { min: 1, max: 40 }); const text = v.text('text', { min: 1, max: 1000 }); v.done();
    const other = q.get(db, 'SELECT * FROM users WHERE pid = ?', seniorId);
    if (!other || other.id === user.id || other.role !== 'STUDENT' || other.semester < HELPER_MIN_SEMESTER || !other.public_profile || !other.available) throw notFound('This student is not currently available to help.');
    if (isBlocked(db, user.id, other.id)) throw forbidden('You cannot message this person.');
    const [a, b] = pair(user.id, other.id); let conv = q.get(db, 'SELECT * FROM conversations WHERE a_id = ? AND b_id = ?', a, b);
    if (!conv) { if (q.get(db, 'SELECT count(*) c FROM conversations WHERE (a_id = ? OR b_id = ?) AND created_at > ?', user.id, user.id, new Date(Date.now() - 864e5).toISOString()).c >= NEW_CONV_PER_DAY) throw new ApiError(429, 'RATE_LIMITED', 'Too many new conversations today.');
      const id = newId(); q.run(db, 'INSERT INTO conversations (id, a_id, b_id, created_at, last_at) VALUES (?,?,?,?,?)', id, a, b, nowIso(), nowIso()); conv = q.get(db, 'SELECT * FROM conversations WHERE id = ?', id); }
    if (recentMessages(db, user.id) >= MSG_PER_HOUR) throw new ApiError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a little.');
    sendMessage(db, conv, user, other, text); status(201); return conversationsFor(db, user).find(c => c.id === conv.id);
  });

  const member = (db, user, id) => { const c = q.get(db, 'SELECT * FROM conversations WHERE id = ? AND (a_id = ? OR b_id = ?)', id, user.id, user.id); if (!c) throw notFound('Conversation not found.'); return { c, other: q.get(db, 'SELECT * FROM users WHERE id = ?', c.a_id === user.id ? c.b_id : c.a_id) }; }; // non-members get the same "not found"
  r.add('POST', '/conversations/:id/messages', { auth: true }, ({ body, params, db, user, status }) => {
    const { c, other } = member(db, user, params.id); const v = validator(body); const text = v.text('text', { min: 1, max: 1000 }); v.done();
    if (isBlocked(db, user.id, other.id)) throw forbidden('You cannot message this person.');
    if (recentMessages(db, user.id) >= MSG_PER_HOUR) throw new ApiError(429, 'RATE_LIMITED', 'You are sending messages too quickly. Please wait a little.');
    const id = sendMessage(db, c, user, other, text); status(201); return { id, from: 'me', text, at: q.get(db, 'SELECT created_at FROM messages WHERE id = ?', id).created_at };
  });
  r.add('POST', '/conversations/:id/read', { auth: true }, ({ params, db, user }) => { const { c } = member(db, user, params.id); const now = nowIso(); q.run(db, 'UPDATE messages SET delivered_at = COALESCE(delivered_at, ?), read_at = COALESCE(read_at, ?) WHERE conversation_id = ? AND sender_id <> ? AND read_at IS NULL', now, now, c.id, user.id); q.run(db, `UPDATE notifications SET read = 1 WHERE user_id = ? AND ref = ?`, user.id, `conv:${c.id}`); return { read: true }; });

  r.add('GET', '/blocks', { auth: true }, ({ db, user }) => q.all(db, 'SELECT u.pid id, u.name FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ?', user.id));
  r.add('POST', '/blocks', { auth: true }, ({ body, db, user, status }) => {
    const v = validator(body); const pid = v.str('userId', { min: 1, max: 40 }); v.done(); const t = q.get(db, 'SELECT * FROM users WHERE pid = ?', pid); if (!t || t.id === user.id) throw notFound('User not found.');
    q.run(db, 'INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?,?,?)', user.id, t.id, nowIso()); status(201); return { blocked: true };
  });
  r.add('DELETE', '/blocks/:pid', { auth: true }, ({ params, db, user }) => { const t = q.get(db, 'SELECT id FROM users WHERE pid = ?', params.pid); if (t) q.run(db, 'DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?', user.id, t.id); return { blocked: false }; });

  r.add('POST', '/reports', { auth: true, limit: ['report', 3600_000, 30] }, ({ body, db, user, status }) => {
    const v = validator(body); const kind = v.oneOf('kind', ['message', 'rating']); const targetId = v.str('targetId', { min: 1, max: 80 }); const reason = v.text('reason', { min: 3, max: 500 }); v.done();
    if (kind === 'message') { if (!q.get(db, 'SELECT 1 x FROM messages m JOIN conversations c ON c.id = m.conversation_id WHERE m.id = ? AND (c.a_id = ? OR c.b_id = ?)', targetId, user.id, user.id)) throw notFound('Message not found.'); }
    else if (!q.get(db, 'SELECT 1 x FROM ratings WHERE id = ?', targetId)) throw notFound('Feedback not found.');
    try { q.run(db, 'INSERT INTO reports (id, reporter_id, kind, target_id, reason, created_at) VALUES (?,?,?,?,?,?)', newId(), user.id, kind, targetId, reason.trim(), nowIso()); }
    catch (e) { if (/UNIQUE/.test(e.message)) throw new ApiError(409, 'ALREADY_REPORTED', 'You have already reported this.'); throw e; }
    status(201); return { reported: true };
  });
}
