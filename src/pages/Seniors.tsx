import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Users, MessageCircle, MessagesSquare } from 'lucide-react';
import { useStore } from '../context/Store';
import { server } from '../services';
import { Avatar, Badge, Card, Empty, Field, Modal, PageHeader } from '../components/ui';

export default function Seniors() {
  const s = useStore(); const nav = useNavigate();
  const [q, setQ] = useState('');
  const [askOpen, setAskOpen] = useState(false); const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<'PRIVATE' | 'GROUP'>('PRIVATE'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  const rows = useMemo(() => s.seniors.filter(x => [x.id, x.name, x.accountType, x.branch, `semester ${x.semester}`, ...x.subjects.map(id => s.subjects.find(u => u.id === id)?.name ?? '')].join(' ').toLowerCase().includes(q.trim().toLowerCase())), [s.seniors, s.subjects, q]);
  const submitAsk = async (e: FormEvent) => {
    e.preventDefault(); if (!server || question.trim().length < 5) return;
    setBusy(true); setError('');
    try {
      const result = await server.askEveryone({ text: question.trim(), mode });
      setAskOpen(false); setQuestion('');
      if (result.mode === 'GROUP' && result.groupId) nav(`/ask-groups/${result.groupId}`);
      else { await s.reload(); nav('/messages'); }
      s.notify(result.mode === 'GROUP' ? `Question shared with ${result.deliveredTo} helpers` : `Question sent privately to ${result.deliveredTo} helpers`);
    } catch (e2) { setError(e2 instanceof Error ? e2.message : 'Your question could not be sent.'); }
    finally { setBusy(false); }
  };

  return <>
    <PageHeader back="/" title="Connect & Ask" sub={s.mode === 'demo' ? 'Sample helper profiles; messages are not delivered in demo mode.' : 'Find opted-in students from semester 3 onward, whatever their account category.'} />
    <Card className="pad ask-everyone-banner">
      <div className="row between wrap gap"><div><div className="row gap"><Users size={21}/><h2 className="h-sm">Ask Everyone</h2></div><p className="muted">Send one academic question to every available helper. Choose private replies or a shared discussion.</p></div>
        <button className="btn" type="button" onClick={() => { setError(''); setAskOpen(true); }} disabled={!server || !s.seniors.length} title={!server ? 'Connect to the StudyPrior API to send real questions' : !s.seniors.length ? 'No helpers are currently available' : undefined}><MessageCircle size={16}/> Ask Everyone</button></div>
      {!server && <p className="muted small">Ask Everyone needs a connected server; demo profiles cannot receive real questions.</p>}
    </Card>
    {s.mode === 'api' && s.askGroups.length > 0 && <><div className="sec-head"><div><p className="eyebrow">Shared discussions</p><h2>Group questions</h2></div></div><div className="stack">{s.askGroups.map(g => <Link key={g.id} to={`/ask-groups/${g.id}`} className="card conv"><div className="row gap"><MessagesSquare size={20}/><div className="grow"><strong>{g.question}</strong><small className="muted">{g.memberCount} participants · {g.memberType === 'ASKER' ? 'You asked' : `Asked by ${g.asker.name}`}</small></div>{g.unread > 0 && <Badge tone="danger">{g.unread} new</Badge>}</div></Link>)}</div></>}
    <div className="sec-head"><div><p className="eyebrow">Available helpers</p><h2>Find an opted-in student</h2></div><span className="muted small">{rows.length} available</span></div>
    <div className="row gap wrap"><div className="search grow"><Search size={18}/><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search student ID, name, branch or subject" aria-label="Search student ID, name, branch or subject" /></div></div>
    {rows.length ? <div className="grid2">{rows.map(r => <Card key={r.id} className="lift"><div className="row gap"><Avatar name={r.name} size={48}/><div><h3>{r.name}</h3><p className="muted">{r.accountType} · Semester {r.semester}</p><p className="muted small">Student ID: {r.id}</p></div><span className="push"><Badge tone="ok">Available to help</Badge></span></div>
      <p>{r.bio || 'No profile description yet.'}</p><p className="muted">{r.branch} · {r.subjects.map(id => s.subjects.find(u => u.id === id)?.name).filter(Boolean).join(', ') || 'No published contribution areas'} · {r.contributions} contributions</p>
      <div className="row gap wrap"><Link className="btn outline" to={`/seniors/${r.id}`}>View profile</Link><button className="btn" onClick={async () => { try { const id = await s.startConvo(r.id, `Hi ${r.name.split(' ')[0]}, I'd appreciate your academic advice.`); nav(`/messages/${id}`); } catch { /* Store displays the error. */ } }}><MessageCircle size={16}/> Ask this student</button></div></Card>)}</div>
      : <Empty title="No helpers match" hint="Only public students in semester 3 or above who have enabled availability appear here, regardless of their selected account category. Try a different search."/>}
    <Modal open={askOpen} title="Ask Everyone" onClose={() => { if (!busy) setAskOpen(false); }}>
      <form className="form" onSubmit={submitAsk}>
        <Field label="Your academic question"><textarea className="input" rows={4} maxLength={1000} minLength={5} required value={question} onChange={e => setQuestion(e.target.value)} placeholder="Describe what you need help with…" /></Field>
        <fieldset className="form"><legend>How should replies work?</legend>
          <label className="row gap check"><input type="radio" name="ask-mode" checked={mode === 'PRIVATE'} onChange={() => setMode('PRIVATE')}/> Separate private conversations <span className="muted small">Each helper replies privately to you.</span></label>
          <label className="row gap check"><input type="radio" name="ask-mode" checked={mode === 'GROUP'} onChange={() => setMode('GROUP')}/> One shared discussion</label>
          {mode === 'GROUP' && <p className="note">All helpers who receive this request and you will be members. Everyone in the discussion can see all messages and replies.</p>}
        </fieldset>
        {error && <p className="err" role="alert">{error}</p>}
        <div className="row gap"><button className="btn" type="submit" disabled={busy || question.trim().length < 5}>{busy ? 'Sending…' : 'Send question'}</button><button className="btn outline" type="button" disabled={busy} onClick={() => setAskOpen(false)}>Cancel</button></div>
      </form>
    </Modal>
  </>;
}
