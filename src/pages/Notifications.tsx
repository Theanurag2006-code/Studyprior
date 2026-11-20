import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/Store';
import { formatWhen } from '../lib/time';
import { Badge, Card, Empty, PageHeader } from '../components/ui';

export default function Notifications() {
  const s = useStore(); const nav = useNavigate();
  const unread = s.notes.filter(n => !n.read).length;
  return (
    <>
      <PageHeader back="/" title="Notifications" sub={`${unread} unread`} action={<button className="btn ghost" disabled={!unread} title={unread ? undefined : 'Everything is read'} onClick={() => { void s.markAllRead().catch(() => undefined); }}>Mark all as read</button>} />
      {s.notes.length ? s.notes.map(n => <Card key={n.id}><button className="note-row" onClick={async () => { try { await s.markRead(n.id); nav(n.to); } catch { /* Store reports the failure. */ } }}>
        <span>{!n.read && <Badge tone="info">New</Badge>} {n.text}</span><small className="muted">{formatWhen(n.at)}</small></button></Card>) : <Empty title="You're all caught up" />}
    </>
  );
}
