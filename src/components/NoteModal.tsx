import { useEffect, useState, type FormEvent } from 'react';
import { useStore } from '../context/Store';
import type { Note } from '../types';
import { Field, Modal } from './ui';

/** Personal notes: private to the signed-in user and never published as advice or ratings. */
export function NoteModal({ open, onClose, subjectId, planId, note, defaultTopicId }: { open: boolean; onClose: () => void; subjectId?: string; planId?: string; note?: Note; defaultTopicId?: string }) {
  const s = useStore();
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [topicId, setTopicId] = useState(''); const [err, setErr] = useState<Record<string, string>>({}); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(note?.title ?? ''); setBody(note?.body ?? ''); setTopicId(note?.topicId ?? defaultTopicId ?? ''); setErr({}); setConfirm(false); } }, [open, note, defaultTopicId]);
  const topics = s.topics.filter(t => t.subjectId === (subjectId ?? note?.subjectId));
  const save = async (e: FormEvent) => {
    e.preventDefault(); const er: Record<string, string> = {}; const t = title.trim(), b = body.trim();
    if (!t || t.length > 80) er.title = 'Add a title (up to 80 characters)'; if (!b) er.body = 'Write something in your note'; else if (b.length > 2000) er.body = 'Keep notes under 2000 characters';
    setErr(er); if (Object.keys(er).length) return;
    setBusy(true);
    try { await s.saveNote({ ...(note ? { id: note.id } : {}), title: t, body: b, subjectId: subjectId ?? note?.subjectId, planId: planId ?? note?.planId, topicId: topicId || undefined });
      s.notify(note ? (s.mode === 'demo' ? 'Note updated on this device' : 'Note updated to your account') : (s.mode === 'demo' ? 'Note added on this device' : 'Note saved to your account')); onClose();
    } catch { /* Keep the form and entered text so the user can retry. */ } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title={note ? 'Edit note' : 'Add note'} onClose={onClose}>
      {confirm ? <>
        <p>Delete <strong>{note?.title}</strong>? You can undo this for a short time after deletion.</p>
        <div className="row gap"><button className="btn" disabled={busy} onClick={async () => { if (!note || busy) return; setBusy(true); try { const removed = note; await s.deleteNote(removed.id); s.notifyUndo('Note deleted', async () => { await s.saveNote({ title: removed.title, body: removed.body, subjectId: removed.subjectId, topicId: removed.topicId, planId: removed.planId }); s.notify('Note restored'); }); onClose(); } catch { /* Keep dialog open when deletion fails. */ } finally { setBusy(false); } }}>Delete</button><button className="btn outline" onClick={() => setConfirm(false)}>Keep note</button></div>
      </> : <form className="form" onSubmit={save} noValidate>
        <p className="note">Private to you. Notes are never shown as advice or ratings. {s.mode === 'demo' ? 'Stored on this device only.' : 'Saved to your StudyPrior account.'}</p>
        <Field label="Title" error={err.title}><input className="input" value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="e.g. Recurrence relations shortcut" /></Field>
        {topics.length > 0 && <Field label="Topic (optional)"><select className="input" value={topicId} onChange={e => setTopicId(e.target.value)}><option value="">Whole subject</option>{topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
        <Field label="Note" error={err.body}><textarea className="input" rows={6} value={body} onChange={e => setBody(e.target.value)} placeholder="Write your note..." /></Field>
        <div className="row gap wrap"><button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button className="btn outline" type="button" onClick={onClose}>Cancel</button>
          {note && <button className="btn ghost push" type="button" onClick={() => setConfirm(true)}>Delete</button>}</div>
      </form>}
    </Modal>
  );
}
