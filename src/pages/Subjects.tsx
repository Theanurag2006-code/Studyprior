import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { NotebookPen, Plus, Trash2 } from 'lucide-react';
import { ME, useStore } from '../context/Store';
import { AddSubjectModal } from '../components/AddSubjectModal';
import { NoteModal } from '../components/NoteModal';
import { Badge, Card, Empty, Modal, PageHeader } from '../components/ui';
import type { Subject, SubjectDraft } from '../types';

export default function Subjects() {
  const s = useStore(); const nav = useNavigate();
  const [adding, setAdding] = useState(false); const [removing, setRemoving] = useState<Subject | null>(null); const [removingDraft, setRemovingDraft] = useState<SubjectDraft | null>(null); const [noteFor, setNoteFor] = useState<Subject | null>(null);
  const contributed = s.allSubjects.filter(x => x.ownerId === ME);
  return (
    <>
      <PageHeader back="/" title="My Subjects" sub="Your personal subject list. The shared catalog is not changed by adding or removing here." action={<button className="btn" onClick={() => setAdding(true)}><Plus size={18} /> Add subject</button>} />
      {s.mySubjects.length ? <div className="grid3">{s.mySubjects.map(x => (
        <Card key={x.id} className="lift subject-card">
          <Link className="subject-card-main" to={`/subjects/${x.id}`} aria-label={`Open ${x.name} subject profile`}>
            <div className="row between gap"><h3>{x.name}</h3>
              <div className="row gap wrap">{x.community && <Badge tone="info">Community</Badge>}{x.status === 'PENDING_REVIEW' && <Badge tone="warn">Pending review</Badge>}</div>
            </div>
            <div className="row gap wrap"><span className="muted">{x.code} · {x.branch} · Sem {x.semester}</span></div>
          </Link>
          <div className="row gap wrap subject-card-actions">
            <button className="icon-btn plus" onClick={() => setNoteFor(x)} aria-label={`Add note for ${x.name}`} title="Add note"><NotebookPen size={16} /></button>
            <Link className="btn ghost" to={`/subjects/${x.id}`}>Open</Link>
            <button className="btn ghost" onClick={() => setRemoving(x)} aria-label={`Remove ${x.name} from my list`}><Trash2 size={16} /> Remove</button>
          </div>
        </Card>))}</div>
        : <Empty title="No subjects yet" hint="Add subjects from the catalog." action={<button className="btn" onClick={() => setAdding(true)}><Plus size={18} /> Add subject</button>} />}
      {s.drafts.length > 0 && <><h2 className="h-sm">Your drafts</h2><p className="muted small">{s.mode === 'demo' ? 'Drafts are private and stored on this device only.' : 'Drafts are private and saved to your StudyPrior account.'}</p>
        {s.drafts.map(d => <Card key={d.id}><div className="row between wrap gap"><div><strong>{d.name || 'Untitled subject'}</strong><p className="muted small">{d.topics.filter(t => t.name.trim()).length} topic(s) · Draft</p></div>
          <div className="row gap"><button className="btn ghost" onClick={() => nav('/subjects/new', { state: { draftId: d.id } })}>Resume</button><button className="btn ghost" onClick={() => setRemovingDraft(d)}>Delete</button></div></div></Card>)}</>}
      {contributed.length > 0 && <><h2 className="h-sm">Your community subjects</h2>
        {contributed.map(x => <Card key={x.id} className="lift subject-card">
          <Link className="subject-card-main" to={`/subjects/${x.id}`} aria-label={`Open ${x.name} subject profile`}>
            <div className="row between wrap gap"><div><strong>{x.name}</strong><p className="muted small">{x.branch} · Sem {x.semester}</p></div>
              <Badge tone={x.status === 'PENDING_REVIEW' ? 'warn' : 'ok'}>{x.status === 'PENDING_REVIEW' ? 'Pending review' : 'Published'}</Badge>
            </div>
          </Link>
          <div className="row gap subject-card-actions"><Link className="btn ghost" to={`/subjects/${x.id}`}>View</Link>
            <button className="btn ghost" disabled title="Published subject editing is not currently supported; you can edit private drafts">Edit</button></div>
        </Card>)}</>}
      <AddSubjectModal open={adding} onClose={() => setAdding(false)} />
      <NoteModal open={!!noteFor} onClose={() => setNoteFor(null)} subjectId={noteFor?.id} />

      <Modal open={!!removingDraft} title="Delete draft?" onClose={() => setRemovingDraft(null)}>
        <p>Delete the private draft <strong>{removingDraft?.name || 'Untitled subject'}</strong>? You can undo this for a short time after deletion.</p>
        <div className="row gap"><button className="btn danger" onClick={async () => { if (!removingDraft) return; const draft = removingDraft; try { await s.deleteDraft(draft.id); s.notifyUndo('Draft deleted', async () => { await s.saveDraft(draft); s.notify('Draft restored'); }); setRemovingDraft(null); } catch { /* Store reports the failure. */ } }}>Delete draft</button><button className="btn outline" onClick={() => setRemovingDraft(null)}>Cancel</button></div>
      </Modal>
      <Modal open={!!removing} title="Remove subject?" onClose={() => setRemoving(null)}>
        <p>Remove <strong>{removing?.name}</strong> from your list? The shared subject, its topics and ratings are not deleted.</p>
        <div className="row gap"><button className="btn" onClick={async () => { if (!removing) return; try { const removed = removing; await s.removeSubject(removed.id); s.notifyUndo('Subject removed from your list', async () => { await s.addSubjects([removed.id]); s.notify('Subject restored to My Subjects'); }); setRemoving(null); } catch { /* Keep confirmation open for retry. */ } }}>Remove</button><button className="btn outline" onClick={() => setRemoving(null)}>Cancel</button></div>
      </Modal>
    </>
  );
}
