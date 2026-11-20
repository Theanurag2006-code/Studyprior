import { useState, type FormEvent } from 'react';
import { useStore } from '../context/Store';
import { squash } from '../lib/purposes';
import { Field, Modal } from './ui';

/** Adds one missing topic to an existing subject. The topic appears (and can be rated) only after the API confirms. */
export function AddTopicModal({ open, onClose, subjectId, onAdded }: { open: boolean; onClose: () => void; subjectId: string; onAdded?: (topicId: string) => void }) {
  const s = useStore(); const subj = s.allSubjects.find(x => x.id === subjectId);
  const [f, setF] = useState({ name: '', unit: '', hours: '', description: '' }); const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState('');
  const units = [...new Set(s.units.filter(u => u.subjectId === subjectId).map(u => u.name))];
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const er: Record<string, string> = {}; const name = squash(f.name);
    if (name.length < 2 || name.length > 80) er.name = 'Topic name must be 2 to 80 characters';
    else if (s.allTopics.some(t => t.subjectId === subjectId && squash(t.name).toLowerCase() === name.toLowerCase())) er.name = 'This topic already exists in this subject';
    if (f.hours && !(Number(f.hours) >= 0.5 && Number(f.hours) <= 200)) er.hours = 'Hours must be 0.5 to 200';
    setErr(er); setFail(''); if (Object.keys(er).length) return;
    setBusy(true);
    try {
      const t = await s.addTopic({ subjectId, name, unit: squash(f.unit), description: f.description.trim(), ...(f.hours ? { hours: Number(f.hours) } : {}) });
      s.notify(`Topic added${s.mode === 'demo' ? ' (demo: stored on this device only)' : ''}. You can rate it now.`); setF({ name: '', unit: '', hours: '', description: '' }); onAdded?.(t.id); onClose();
    } catch (x) { setFail(x instanceof Error ? x.message : 'Could not add the topic.'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={`Add topic${subj ? ` to ${subj.name}` : ''}`} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <p className="note">The topic is added to the shared subject for everyone to rate once it is saved. Missing a whole subject? Use “Add a new subject” on the Share experience page.</p>
        <Field label="Topic name" error={err.name}><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <datalist id="topic-units">{units.map(u => <option key={u} value={u} />)}</datalist>
        <div className="grid2 tight"><Field label="Unit (optional)"><input className="input" list="topic-units" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} placeholder="Existing or new; blank = General" /></Field>
          <Field label="Study hours (optional)" error={err.hours}><input className="input" inputMode="decimal" value={f.hours} onChange={e => setF({ ...f, hours: e.target.value })} /></Field></div>
        <Field label="Description (optional)"><input className="input" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        {fail && <p className="err" role="alert">Not added: {fail} Your input is kept, so you can try again.</p>}
        <div className="row gap"><button className="btn" type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add topic'}</button><button className="btn outline" type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
      </form>
    </Modal>
  );
}
