import { useEffect, useState } from 'react';
import { CheckCheck, Eye, Send } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../context/Store';
import { formatWhen } from '../lib/time';
import { Avatar, Badge, Card, Empty, Modal, PageHeader } from '../components/ui';

export default function Messages() {
  const s = useStore(); const { id } = useParams(); const nav = useNavigate(); const [busy, setBusy] = useState(false); const [reporting, setReporting] = useState<string | null>(null); const [reason, setReason] = useState('');
  const cur = s.convos.find(c => c.id === id);
  useEffect(() => { if (id && cur?.unread) s.readConvo(id); }, [id, cur?.unread]);
  const name = (c: { seniorId: string; peer?: { name: string } }) => c.peer?.name ?? s.seniors.find(x => x.id === c.seniorId)?.name ?? 'Student';
  const send = async () => { if (!cur) return; setBusy(true); try { const real = await s.send(cur.id); if (s.mode === 'demo') s.notify('Saved locally. Not delivered (demo).'); if (real !== cur.id) nav(`/messages/${real}`, { replace: true }); } catch { /* the error was already shown and the draft is kept */ } finally { setBusy(false); } };
  const lastIncoming = cur ? [...cur.messages].reverse().find(m => m.from === 'them') : undefined;
  return (
    <>
      <PageHeader title="Messages" back={id ? '/messages' : '/'} />
      <p className="note">{s.mode === 'demo' ? 'Demo mode: messages stay on this device. Nothing is delivered to a real person, and drafts are never sent automatically.' : 'Messages are private between you and the other person. Your draft is never sent until you press Send. New messages appear within about 10 seconds.'}</p>
      <div className="split">
        <Card className="list">{s.convos.length ? s.convos.map(c => (
          <Link key={c.id} to={`/messages/${c.id}`} className={`conv ${c.id === id ? 'on' : ''}`}><Avatar name={name(c)} /><div><strong>{name(c)}</strong><small className="muted">{c.messages[c.messages.length - 1]?.text ?? 'Draft'}</small></div>{c.unread > 0 && <Badge tone="danger">{c.unread}</Badge>}</Link>))
          : <Empty title="No conversations" action={<Link className="btn" to="/seniors">Find a helper</Link>} />}</Card>
        <Card>{cur ? <div className="thread">
          <div className="row between wrap gap"><h3>{name(cur)}</h3>
            {s.mode === 'api' && !cur.id.startsWith('new:') && <div className="row gap"><button className="btn ghost" disabled={!lastIncoming} title={lastIncoming ? 'Report their latest message' : 'Nothing to report yet'} onClick={() => { setReason(''); setReporting(lastIncoming?.id ?? null); }}>Report</button>
              <button className="btn ghost" onClick={() => { if (window.confirm(`Block ${name(cur)}? Neither of you will be able to message the other.`)) void s.block(cur.seniorId).catch(() => undefined); }}>Block</button></div>}</div>
          {cur.blocked && <p className="note">This conversation is blocked, so messages can't be sent.</p>}
          <div className="msgs" aria-live="polite">{cur.messages.length ? cur.messages.map(m => <div key={m.id} className={`msg ${m.from}`}><p>{m.text}</p><small>{formatWhen(m.at)}</small>{m.from === 'me' && m.deliveryStatus && <small className={`message-receipt ${m.deliveryStatus.toLowerCase()}`} aria-label={m.deliveryStatus === 'SEEN' ? 'Seen' : m.deliveryStatus === 'DELIVERED' ? 'Delivered' : 'Sent'}>{m.deliveryStatus === 'SEEN' ? <><Eye size={12}/> Seen</> : m.deliveryStatus === 'DELIVERED' ? <><CheckCheck size={13}/> Delivered</> : <><Send size={11}/> Sent</>}</small>}</div>) : <p className="muted">No messages yet. Edit the draft below, then press Send.</p>}</div>
          <textarea className="input" rows={4} maxLength={1000} value={cur.draft} onChange={e => s.setDraft(cur.id, e.target.value)} aria-label="Message draft" placeholder="Write a message" />
          <div className="row gap"><button className="btn" disabled={!cur.draft.trim() || busy || !!cur.blocked} onClick={send}>{busy ? 'Sending…' : s.mode === 'demo' ? 'Send (local demo)' : 'Send'}</button>
            <button className="btn ghost" onClick={() => nav('/messages')}>Close</button></div></div>
          : <Empty title="Select a conversation" />}</Card>
      </div>
      <Modal open={!!reporting} title="Report this message" onClose={() => setReporting(null)}>
        <p className="muted">Tell the moderators what is wrong. They can read the reported message.</p>
        <textarea className="input" rows={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} aria-label="Reason" />
        <div className="row gap"><button className="btn" disabled={reason.trim().length < 3} onClick={() => { void s.reportMessage(reporting!, reason.trim()).then(() => setReporting(null)).catch(() => undefined); }}>Send report</button><button className="btn outline" onClick={() => setReporting(null)}>Cancel</button></div>
      </Modal>
    </>
  );
}
