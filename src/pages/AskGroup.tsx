import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCheck, Eye, Send } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { server } from '../services';
import type { AskGroupDetail } from '../types';
import { Avatar, Badge, Card, Empty, PageHeader, Spinner } from '../components/ui';

export default function AskGroup() {
  const { id = '' } = useParams();
  const [data, setData] = useState<AskGroupDetail | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [text, setText] = useState(''); const [busy, setBusy] = useState(false);

  const load = useCallback(async (markRead = false) => {
    if (!server) { setError('Shared discussions require a connected StudyPrior account.'); setLoading(false); return; }
    try {
      const result = await server.getAskGroup(id);
      setData(result); setError('');
      if (markRead) await server.markAskGroupRead(id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not open this discussion.'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { setLoading(true); void load(true); }, [load]);
  useEffect(() => {
    if (!server) return;
    const timer = window.setInterval(() => { if (!document.hidden) void load(true); }, 10_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const send = async (e: FormEvent) => {
    e.preventDefault(); if (!server || !text.trim() || busy) return;
    setBusy(true); setError('');
    try { await server.sendAskGroupMessage(id, text.trim()); setText(''); await load(true); }
    catch (e2) { setError(e2 instanceof Error ? e2.message : 'Message could not be sent.'); }
    finally { setBusy(false); }
  };

  if (loading) return <><PageHeader back="/seniors" title="Shared discussion"/><Spinner label="Loading discussion"/></>;
  if (!data) return <><PageHeader back="/seniors" title="Shared discussion"/><Empty title="Discussion unavailable" hint={error || 'This discussion may have been removed or you may not be a participant.'} action={<Link className="btn outline" to="/seniors">Back to Connect & Ask</Link>}/></>;

  return <>
    <PageHeader back="/seniors" title="Shared discussion" sub={`Started by ${data.asker.name} · ${data.members.length} participants`}/>
    <p className="note">This is a shared discussion. Every participant can read all messages and replies. Do not post private information.</p>
    {error && <p className="err" role="alert">{error}</p>}
    <Card className="pad">
      <div className="row between wrap gap"><div><Badge tone="demo">Original question</Badge><h3>{data.question}</h3></div><Badge>{data.memberType === 'ASKER' ? 'You asked' : 'You are helping'}</Badge></div>
      <h3 className="h-sm">Participants</h3>
      <div className="row gap wrap">{data.members.map(m => <div className="row gap" key={m.id}><Avatar name={m.name} size={30}/><span><strong>{m.name}</strong><small className="muted"> · {m.accountType}, Sem {m.semester}</small></span></div>)}</div>
    </Card>
    <Card className="pad">
      <h3>Discussion</h3>
      <div className="msgs" aria-live="polite">{data.messages.map(m => <div className={`msg ${m.mine ? 'me' : 'them'}`} key={m.id}><strong>{m.mine ? 'You' : m.senderName}</strong><p>{m.text}</p><small>{new Date(m.at).toLocaleString()}</small>{m.mine && m.deliveryStatus && <small className={`message-receipt ${m.deliveryStatus.toLowerCase()}`} aria-label={m.deliveryStatus.replace(/_/g, ' ')}>{m.deliveryStatus === 'SEEN' ? <><Eye size={12}/> Seen by everyone</> : m.deliveryStatus === 'PARTIAL_SEEN' ? <><Eye size={12}/> Seen by {m.seenCount}/{m.recipientCount}</> : m.deliveryStatus === 'DELIVERED' ? <><CheckCheck size={13}/> Delivered to everyone</> : m.deliveryStatus === 'PARTIAL_DELIVERED' ? <><CheckCheck size={13}/> Delivered to {m.deliveredCount}/{m.recipientCount}</> : <><Send size={11}/> Sent</>}</small>}</div>)}</div>
      <form className="form" onSubmit={send}>
        <label className="field"><span>Your reply</span><textarea className="input" rows={3} maxLength={1000} value={text} onChange={e => setText(e.target.value)} placeholder="Write a reply for everyone in this discussion…"/></label>
        <button className="btn" disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send to discussion'}</button>
      </form>
    </Card>
  </>;
}
