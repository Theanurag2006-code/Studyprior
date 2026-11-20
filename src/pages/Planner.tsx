import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { NotebookPen, Pencil, Trash2 } from 'lucide-react';
import { useStore } from '../context/Store';
import { PURPOSES, purposeLabel, squash, validatePurpose } from '../lib/purposes';
import { todayISO } from '../lib/priority';
import type { Note, PlanItem, PlanStatus, PurposeCode } from '../types';
import { NoteModal } from '../components/NoteModal';
import { PurposeField } from '../components/PurposeField';
import { Badge, Card, Empty, Field, Modal, PageHeader } from '../components/ui';

const STATUSES: PlanStatus[] = ['Planned', 'In Progress', 'Completed'];
type Form = { topicId: string; target: string; minutes: string; purpose: PurposeCode | ''; custom: string };

function PlanEdit({ item, onClose }: { item: PlanItem | null; onClose: () => void }) {
  const s = useStore(); const [f, setF] = useState<Form | null>(null); const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  const cur: Form = f ?? { topicId: item?.topicId ?? '', target: item?.target ?? '', minutes: String(item?.minutes ?? 60), purpose: item?.purpose ?? '', custom: item?.customPurpose ?? '' };
  const save = async (e: FormEvent) => {
    e.preventDefault(); if (!item) return; const er: Record<string, string> = {}; const m = Number(cur.minutes);
    if (!cur.target) er.target = 'Pick a date'; if (!Number.isInteger(m) || m < 5 || m > 600) er.minutes = 'Enter 5 to 600 minutes';
    const pe = validatePurpose(cur.purpose, cur.custom); if (pe) er.custom = pe; setErr(er); if (Object.keys(er).length) return;
    setBusy(true); try { await s.updatePlan(item.id, { target: cur.target, minutes: m, purpose: cur.purpose || undefined, customPurpose: cur.purpose === 'OTHER' ? squash(cur.custom) : undefined }); s.notify(s.mode === 'demo' ? 'Plan updated on this device' : 'Plan updated to your account'); setF(null); onClose(); } catch { /* Keep the editor open so the user can retry. */ } finally { setBusy(false); }
  };
  return (
    <Modal open={!!item} title="Edit plan item" onClose={() => { setF(null); onClose(); }}>
      <form className="form" onSubmit={save} noValidate>
        <Field label="Target date" error={err.target}><input className="input" type="date" value={cur.target} onChange={e => setF({ ...cur, target: e.target.value })} /></Field>
        <Field label="Minutes" error={err.minutes}><input className="input" inputMode="numeric" value={cur.minutes} onChange={e => setF({ ...cur, minutes: e.target.value })} /></Field>
        <PurposeField code={cur.purpose} custom={cur.custom} error={err.custom} onChange={(code, custom) => setF({ ...cur, purpose: code, custom })} />
        <div className="row gap"><button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button className="btn outline" type="button" onClick={() => { setF(null); onClose(); }}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export default function Planner() {
  const s = useStore(); const [sp] = useSearchParams();
  const [f, setF] = useState<Form>({ topicId: '', target: todayISO(), minutes: '60', purpose: '', custom: '' }); const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [fs, setFs] = useState('All'); const [fp, setFp] = useState('All'); const [fw, setFw] = useState('All');
  const [edit, setEdit] = useState<PlanItem | null>(null); const [removing, setRemoving] = useState<PlanItem | null>(null); const [noteFor, setNoteFor] = useState<{ plan: PlanItem; note?: Note } | null>(null);
  const today = todayISO();
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const er: Record<string, string> = {}; const m = Number(f.minutes);
    if (!f.topicId) er.topic = 'Choose a topic'; if (!f.target) er.target = 'Pick a date'; if (!Number.isInteger(m) || m < 5 || m > 600) er.minutes = 'Enter 5 to 600 minutes';
    const pe = validatePurpose(f.purpose, f.custom); if (pe) er.custom = pe; setErr(er); if (Object.keys(er).length) return;
    setBusy(true); try { await s.addPlan({ topicId: f.topicId, target: f.target, minutes: m, status: 'Planned', purpose: f.purpose || undefined, customPurpose: f.purpose === 'OTHER' ? squash(f.custom) : undefined });
      setF({ ...f, topicId: '', custom: '' }); s.notify(s.mode === 'demo' ? 'Added to planner on this device' : 'Added to your planner');
    } catch { /* Keep form values for retry. */ } finally { setBusy(false); }
  };
  const count = (st: PlanStatus) => s.plans.filter(p => p.status === st).length;
  const shown = s.plans.filter(p => (fs === 'All' || p.status === fs) && (fp === 'All' || (fp === 'NONE' ? !p.purpose : p.purpose === fp))
    && (fw === 'All' || (fw === 'Overdue' ? p.target < today && p.status !== 'Completed' : fw === 'Today' ? p.target === today : p.target > today)));
  const topicOf = (id: string) => s.allTopics.find(t => t.id === id);
  return (
    <>
      <PageHeader back="/" title="Study planner" sub={s.mode === 'demo' ? 'Demo mode: plans and notes are stored on this device only.' : 'Your plans and notes are saved to your StudyPrior account.'} />
      {sp.get('focus') === 'streak' && <Card><h3>Study streak: {s.user.streak} day{s.user.streak === 1 ? '' : 's'}</h3>
        <p className="muted">Your streak comes from your profile data. You have completed {count('Completed')} plan item{count('Completed') === 1 ? '' : 's'}; finishing items here is how you build study activity.</p></Card>}
      <div className="grid4">{[['Total', s.plans.length], ['Planned', count('Planned')], ['In progress', count('In Progress')], ['Completed', count('Completed')]].map(([l, v]) => <Card key={l}><p className="muted">{l}</p><p className="big">{v}</p></Card>)}</div>
      <Card><form className="form" onSubmit={submit} noValidate>
        <div className="grid2 tight">
          <Field label="Topic" error={err.topic}><select className="input" value={f.topicId} onChange={e => setF({ ...f, topicId: e.target.value })}><option value="">Select…</option>{s.topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
          <Field label="Target date" error={err.target}><input className="input" type="date" value={f.target} onChange={e => setF({ ...f, target: e.target.value })} /></Field>
          <Field label="Minutes" error={err.minutes}><input className="input" inputMode="numeric" value={f.minutes} onChange={e => setF({ ...f, minutes: e.target.value })} /></Field>
          <PurposeField code={f.purpose} custom={f.custom} error={err.custom} onChange={(purpose, custom) => setF({ ...f, purpose, custom })} />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add topic'}</button></form></Card>
      <div className="row gap wrap" role="group" aria-label="Filters">
        {['All', ...STATUSES].map(x => <button key={x} className={`chip-btn ${fs === x ? 'on' : ''}`} aria-pressed={fs === x} onClick={() => setFs(x)}>{x}</button>)}
        <select className="input" aria-label="Filter by date" value={fw} onChange={e => setFw(e.target.value)}><option value="All">Any date</option><option>Overdue</option><option>Today</option><option>Upcoming</option></select>
        <select className="input" aria-label="Filter by purpose" value={fp} onChange={e => setFp(e.target.value)}><option value="All">Any purpose</option><option value="NONE">No purpose set</option>{PURPOSES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
      </div>
      <p className="muted" aria-live="polite">{shown.length} of {s.plans.length} item{s.plans.length === 1 ? '' : 's'}</p>
      {shown.length ? shown.map(p => { const t = topicOf(p.topicId); const nts = s.userNotes.filter(n => n.planId === p.id); return (
        <Card key={p.id}><div className="row between wrap gap"><div>{t ? <Link className="tname" to={`/topics/${t.id}`}>{t.name}</Link> : <strong>Removed topic</strong>}
          <p className="muted">Due {p.target} · {p.minutes} min {purposeLabel(p) && <Badge tone="demo">{purposeLabel(p)}</Badge>}</p></div>
          <div className="row gap wrap"><select className="input" value={p.status} aria-label="Status" onChange={async e => { try { await s.setPlanStatus(p.id, e.target.value as PlanStatus); s.notify(s.mode === 'demo' ? 'Plan status updated on this device' : 'Plan status updated'); } catch { /* Store reports the failure; state remains unchanged. */ } }}>{STATUSES.map(x => <option key={x}>{x}</option>)}</select>
            <button className="icon-btn plus" aria-label={`Add note for ${t?.name ?? 'this item'}`} title="Add note" onClick={() => setNoteFor({ plan: p })}><NotebookPen size={16} /></button>
            <button className="icon-btn" aria-label={`Edit ${t?.name ?? 'plan item'}`} title="Edit" onClick={() => setEdit(p)}><Pencil size={18} /></button>
            <button className="icon-btn" aria-label={`Remove ${t?.name ?? 'plan item'} from planner`} title="Remove" onClick={() => setRemoving(p)}><Trash2 size={18} /></button></div></div>
          {nts.length > 0 && <div className="row gap wrap">{nts.map(n => <button key={n.id} className="chip-btn" onClick={() => setNoteFor({ plan: p, note: n })} aria-label={`Open note ${n.title}`}>{n.title}</button>)}</div>}</Card>); })
        : <Empty title={s.plans.length ? 'No plan items match these filters' : 'Your planner is empty'} hint={s.plans.length ? 'Clear a filter to see more.' : 'Add a topic above.'} action={!s.plans.length ? <Link className="btn outline" to="/explore">Explore topics</Link> : undefined} />}
      <Modal open={!!removing} title="Remove plan item?" onClose={() => setRemoving(null)}>
        <p>Remove this item from your planner? Its personal notes will be kept, but detached from the plan. You can undo the removal for a short time.</p>
        <div className="row gap"><button className="btn danger" onClick={async () => { if (!removing) return; const item = removing; const attached = s.userNotes.filter(n => n.planId === item.id); try { await s.removePlan(item.id); s.notifyUndo('Plan item removed', async () => { const restored = await s.addPlan({ topicId: item.topicId, target: item.target, minutes: item.minutes, status: item.status, purpose: item.purpose, customPurpose: item.customPurpose }); for (const n of attached) await s.saveNote({ title: n.title, body: n.body, subjectId: n.subjectId, topicId: n.topicId, planId: restored.id }); s.notify('Plan item restored'); }); setRemoving(null); } catch { /* Keep the dialog available for retry. */ } }}>Remove</button><button className="btn outline" onClick={() => setRemoving(null)}>Cancel</button></div>
      </Modal>
      <PlanEdit item={edit} onClose={() => setEdit(null)} />
      <NoteModal open={!!noteFor} onClose={() => setNoteFor(null)} planId={noteFor?.plan.id} subjectId={topicOf(noteFor?.plan.topicId ?? '')?.subjectId} defaultTopicId={noteFor?.plan.topicId} note={noteFor?.note} />
    </>
  );
}
