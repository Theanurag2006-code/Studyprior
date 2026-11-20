import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Send } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ME, useStore } from '../context/Store';
import { AddTopicModal } from '../components/AddTopicModal';
import { Card, Field, PageHeader, StarRating } from '../components/ui';

const blank = { subjectId: '', topicId: '', importance: 0, difficulty: 0, exam: 0, interview: 0, advice: '', mistakes: '' };
const SCALES = [['importance', 'Importance'], ['difficulty', 'Difficulty'], ['exam', 'Exam Relevance'], ['interview', 'Interview Relevance']] as const;

export default function Share() {
  const s = useStore(); const [f, setF] = useState(blank); const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [done, setDone] = useState(''); const [fail, setFail] = useState('');
  const [sp] = useSearchParams(); const nav = useNavigate(); const [addingTopic, setAddingTopic] = useState(false);
  const mine = s.ratings.filter(r => r.userId === ME);
  const existing = mine.find(r => r.topicId === f.topicId);
  const dirty = !done && !!(f.advice || f.mistakes || f.importance || f.difficulty || f.exam || f.interview);
  const load = (topicId: string, subjectId: string) => { const r = mine.find(x => x.topicId === topicId); setF(r ? { subjectId, topicId, importance: r.importance, difficulty: r.difficulty, exam: r.exam, interview: r.interview, advice: r.advice, mistakes: r.mistakes } : { ...blank, subjectId, topicId }); setErr({}); setDone(''); setFail(''); };
  useEffect(() => { const pre = s.topics.find(x => x.id === sp.get('topic')); if (pre) load(pre.id, pre.subjectId); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const touch = () => { setDone(''); setFail(''); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const er: Record<string, string> = {};
    if (!f.subjectId) er.subject = 'Select a subject'; if (!f.topicId) er.topic = 'Select a topic';
    SCALES.forEach(([k]) => { if (!f[k]) er[k] = 'Choose 1 to 5 stars'; });
    if (f.advice.trim().length < 20) er.advice = 'Share at least 20 characters of advice'; else if (f.advice.length > 1000) er.advice = 'Keep advice under 1000 characters';
    setErr(er); setDone(''); setFail(''); if (Object.keys(er).length) { s.notify('Please fix the highlighted fields'); return; }
    setBusy(true);
    try {
      await s.saveRating({ topicId: f.topicId, importance: f.importance, difficulty: f.difficulty, exam: f.exam, interview: f.interview, advice: f.advice.trim(), mistakes: f.mistakes.trim() });
      setDone(`${existing ? 'Rating updated' : 'Rating saved'}. ${s.mode === 'demo' ? 'Demo mode: stored on this device only, not on a server.' : 'Confirmed by the server.'}`);
    } catch (x) { setFail(x instanceof Error ? x.message : 'Could not save your rating.'); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader back="/" dirty={dirty} title="Share experience" sub="Help juniors prioritize what really matters." />
      <AddTopicModal open={addingTopic} onClose={() => setAddingTopic(false)} subjectId={f.subjectId} onAdded={id => load(id, f.subjectId)} />
      {s.drafts.length > 0 && <Card><h3>Your subject drafts</h3><p className="muted small">{s.mode === 'demo' ? 'Private, stored on this device only.' : 'Private drafts saved to your StudyPrior account.'}</p>{s.drafts.map(d => <div key={d.id} className="row between wrap gap"><span>{d.name || 'Untitled subject'}</span><button className="btn ghost" onClick={() => nav('/subjects/new', { state: { draftId: d.id } })}>Resume</button></div>)}</Card>}
      <Card className="pad"><form className="form" onSubmit={submit} noValidate>
        <div className="grid2 tight">
          <div className="field"><div className="row between"><span>Subject</span>
            <button type="button" className="link" onClick={() => { if (dirty && !window.confirm('Leave this rating? Your unsaved answers will be lost.')) return; nav('/subjects/new'); }}><Plus size={16} /> Add a new subject</button></div>
            <select className="input" aria-label="Subject" value={f.subjectId} onChange={e => { setF({ ...blank, subjectId: e.target.value }); touch(); }}><option value="">Select subject</option>{s.subjects.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
            {err.subject && <small className="err" role="alert">{err.subject}</small>}</div>
          <div className="field"><div className="row between"><span>Topic</span>
            <button type="button" className="link" disabled={!f.subjectId} title={f.subjectId ? 'Add a missing topic to this subject' : 'Choose a subject first'} onClick={() => setAddingTopic(true)}><Plus size={16} /> Add topic</button></div>
            <select className="input" aria-label="Topic" value={f.topicId} disabled={!f.subjectId} onChange={e => load(e.target.value, f.subjectId)}><option value="">Select topic</option>
              {s.units.filter(u => u.subjectId === f.subjectId).map(u => <optgroup key={u.id} label={u.name}>{s.topics.filter(t => t.unitId === u.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}</select>
            {err.topic && <small className="err" role="alert">{err.topic}</small>}</div>
        </div>
        {existing && <p className="note">You already rated this topic. Submitting updates your existing rating.</p>}
        <div className="grid2 tight">{SCALES.map(([k, label]) => <StarRating key={k} label={label} value={f[k]} error={err[k]} onChange={n => { setF(p => ({ ...p, [k]: n })); touch(); }} />)}</div>
        <Field label="Student Advice" error={err.advice}><textarea className="input" rows={5} placeholder="Share what worked for you..." value={f.advice} onChange={e => { setF(p => ({ ...p, advice: e.target.value })); touch(); }} /></Field>
        <p className="muted small">Shown as {s.user.accountType ?? 'Student'} student advice. Any student can rate topics. Your private notes are never shared here.</p>
        <Field label="Common Mistake"><textarea className="input" rows={4} placeholder="What do juniors usually get wrong?" value={f.mistakes} onChange={e => { setF(p => ({ ...p, mistakes: e.target.value })); touch(); }} /></Field>
        <div className="row gap wrap"><button className="btn lg" type="submit" disabled={busy}><Send size={18} /> {busy ? 'Submitting…' : existing ? 'Update rating' : 'Submit rating'}</button>
          {done && <span className="ok-text" role="status">{done}</span>}</div>
        {fail && <p className="err" role="alert">Not saved: {fail} Your answers are still here, so you can try again.</p>}
      </form></Card>
      <h2 className="h-sm">Your contributions</h2>
      {mine.length ? mine.map(r => { const t = s.allTopics.find(x => x.id === r.topicId); return <Card key={r.id}><div className="row between"><strong>{t?.name}</strong><button className="btn outline" onClick={() => t && load(t.id, t.subjectId)}>Edit</button></div><p className="muted">{r.advice}</p></Card>; }) : <p className="muted">Nothing shared yet.</p>}
    </>
  );
}
