import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../context/Store';
import { BRANCHES } from '../data/mock';
import { findSimilar, toInput, validateDraft } from '../lib/catalog';
import type { DraftTopic, SubjectDraft } from '../types';
import { BackButton, Badge, Card, Field, PageHeader } from '../components/ui';

const emptyTopic = (): DraftTopic => ({ name: '', unit: '', description: '', hours: '' });
const STEPS = ['Subject', 'Topics', 'Review'];

/** Flow B: create a missing subject plus topics. Nothing is public until the API confirms publication. */
export default function SubjectNew() {
  const s = useStore(); const nav = useNavigate(); const loc = useLocation();
  const resume = s.drafts.find(x => x.id === (loc.state as { draftId?: string } | null)?.draftId);
  const [d, setD] = useState<SubjectDraft>(() => resume ?? { id: `d${Date.now().toString(36)}`, name: '', branch: s.user.branch, semester: s.user.semester, description: '', topics: [emptyTopic()], updatedAt: '' });
  const [snap] = useState(() => JSON.stringify([d.name, d.description, d.topics]));
  const [step, setStep] = useState(1); const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState(''); const [done, setDone] = useState(false);
  const dirty = !done && JSON.stringify([d.name, d.description, d.topics]) !== snap;
  const similar = findSimilar(d.name, s.allSubjects);
  const units = [...new Set(d.topics.map(t => t.unit.trim()).filter(Boolean))];
  const setTopic = (i: number, p: Partial<DraftTopic>) => setD(x => ({ ...x, topics: x.topics.map((t, k) => (k === i ? { ...t, ...p } : t)) }));
  const check = (upTo: number) => { const all = validateDraft(d); const keep = Object.fromEntries(Object.entries(all).filter(([k]) => (upTo === 1 ? ['name', 'branch', 'semester', 'description'].includes(k) : true))); setErr(keep); return !Object.keys(keep).length; };
  const next = () => { if (check(step === 1 ? 1 : 2)) setStep(step + 1); };
  const saveDraft = async () => { setBusy(true); setFail(''); try { await s.saveDraft({ ...d, updatedAt: new Date().toISOString() }); s.notify(s.mode === 'demo' ? 'Draft saved on this device' : 'Draft saved to your account'); } catch (e) { setFail(e instanceof Error ? e.message : 'Could not save draft.'); } finally { setBusy(false); } };
  const cancel = () => { if (dirty && !window.confirm('Discard this subject? Unsaved changes will be lost.')) return; setDone(true); nav('/share'); };
  const publish = async () => {
    if (!check(3)) { setStep(1); return; }
    setBusy(true); setFail('');
    try {
      const res = await s.publishSubject(toInput(d)); setDone(true); try { await s.deleteDraft(d.id); } catch { /* Publication succeeded; a stale draft can be cleaned up later. */ }
      const demo = s.mode === 'demo' ? ' (demo: stored on this device only)' : '';
      s.notify(res.subject.status === 'PENDING_REVIEW' ? 'Submitted for review. It is not public until approved.' : `Published. Topics are open for feedback${demo}.`);
      const firstTopic = res.topics[0]; // published subjects open the rating form for their first topic; subjects pending review are not rateable yet
      nav(res.subject.status === 'PENDING_REVIEW' || !firstTopic ? `/subjects/${res.subject.id}` : `/share?topic=${firstTopic.id}`, { replace: true });
    } catch (e) { setFail(e instanceof Error ? e.message : 'Publishing failed.'); } finally { setBusy(false); }
  };
  type InTopic = ReturnType<typeof toInput>['topics'][number];
  const grouped = toInput(d).topics.reduce<Record<string, InTopic[]>>((a, t) => { (a[t.unit] ||= []).push(t); return a; }, {});
  return (
    <div className="narrow">
      <BackButton fallback="/share" dirty={dirty} label="Back to Share experience" />
      <PageHeader title="Add a new subject" sub="Can't find your subject? Add it with its topics so others can rate them." />
      <div className="row gap wrap" aria-label="Progress">{STEPS.map((l, i) => <Badge key={l} tone={step === i + 1 ? 'info' : step > i + 1 ? 'ok' : 'neutral'}>{i + 1}. {l}</Badge>)}</div>
      <Card className="pad">
        {step === 1 && <>
          <Field label="Subject name" error={err.name}><input className="input" value={d.name} onChange={e => setD({ ...d, name: e.target.value })} /></Field>
          {similar.length > 0 && <div className="note" role="status"><strong>Similar subjects already exist.</strong> Add one instead to avoid duplicates:
            {similar.map(x => <div key={x.id} className="row between gap"><span>{x.name} · {x.branch} · Sem {x.semester}</span>
              <button className="btn ghost" onClick={async () => { try { const r = await s.addSubjects([x.id]); s.notify(r.added ? 'Added to your list' : 'Already in your list'); } catch { /* Store reports the failure. */ } }}>Add to my list</button></div>)}</div>}
          <div className="grid2 tight">
            <Field label="Department / branch" error={err.branch}><select className="input" value={d.branch} onChange={e => setD({ ...d, branch: e.target.value })}>{BRANCHES.map(b => <option key={b}>{b}</option>)}</select></Field>
            <Field label="Semester" error={err.semester}><select className="input" value={d.semester} onChange={e => setD({ ...d, semester: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>Semester {n}</option>)}</select></Field>
          </div>
          <Field label="Description (optional)" error={err.description}><textarea className="input" rows={3} value={d.description} onChange={e => setD({ ...d, description: e.target.value })} /></Field>
        </>}
        {step === 2 && <>
          {err.topics && <p className="err" role="alert">{err.topics}</p>}
          <datalist id="unit-options">{units.map(u => <option key={u} value={u} />)}</datalist>
          {d.topics.map((t, i) => (
            <div key={i} className="card" style={{ marginBottom: 0 }}>
              <div className="grid2 tight"><Field label={`Topic ${i + 1} name`} error={err[`topic-${i}`]}><input className="input" value={t.name} onChange={e => setTopic(i, { name: e.target.value })} /></Field>
                <Field label="Unit (optional)"><input className="input" list="unit-options" value={t.unit} onChange={e => setTopic(i, { unit: e.target.value })} placeholder="Existing or new unit; blank = General" /></Field>
                <Field label="Estimated study hours (optional)" error={err[`hours-${i}`]}><input className="input" inputMode="decimal" value={t.hours} onChange={e => setTopic(i, { hours: e.target.value })} /></Field>
                <Field label="Description (optional)"><input className="input" value={t.description} onChange={e => setTopic(i, { description: e.target.value })} /></Field></div>
              {d.topics.length > 1 && <button className="btn ghost" type="button" onClick={() => setD(x => ({ ...x, topics: x.topics.filter((_, k) => k !== i) }))} aria-label={`Remove topic ${i + 1}`}><Trash2 size={16} /> Remove topic</button>}
            </div>))}
          <button className="btn outline" type="button" onClick={() => setD(x => ({ ...x, topics: [...x.topics, emptyTopic()] }))}><Plus size={16} /> Add another topic</button>
        </>}
        {step === 3 && <>
          <h3>{toInput(d).name}</h3><p className="muted">{d.branch} · Semester {d.semester}</p>{d.description && <p>{d.description}</p>}
          {Object.entries(grouped).map(([u, ts]) => <div key={u}><strong>{u}</strong><ul>{ts.map(t => <li key={t.name}>{t.name}{t.hours ? ` (~${t.hours} h)` : ''}</li>)}</ul></div>)}
          <p className="note">{s.mode === 'demo' ? 'Demo mode: publishing saves to this device only, not a server.' : 'Publishing sends this to the StudyPrior server. It becomes available for rating only after the server confirms publication (or after review, if moderation applies).'}</p>
          {fail && <p className="err" role="alert">Not published: {fail} Your subject is still here, so you can try again or save a draft.</p>}
        </>}
        <div className="row gap wrap">
          {step > 1 && <button className="btn outline" type="button" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
          {step < 3 ? <button className="btn" type="button" onClick={next}>Next</button> : <button className="btn" type="button" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish for feedback'}</button>}
          <button className="btn outline" type="button" onClick={() => { void saveDraft(); }} disabled={busy}>Save draft</button>
          <button className="btn ghost push" type="button" onClick={cancel} disabled={busy}>Cancel</button>
        </div>
      </Card>
      <p className="muted small">Already in the catalog? <Link to="/subjects">Add an existing subject</Link> instead.</p>
    </div>
  );
}
