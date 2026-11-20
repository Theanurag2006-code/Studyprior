import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useStore } from '../context/Store';
import { Priority } from '../components/TopicCard';
import { useState } from 'react';
import type { Topic } from '../types';
import { Badge, Card, Empty, Modal, PageHeader } from '../components/ui';

export default function Saved() {
  const s = useStore(); const [removing, setRemoving] = useState<Topic | null>(null);
  const rows = s.topics.filter(t => s.saved.includes(t.id));
  return (
    <>
      <PageHeader back="/" title="Saved Topics" />
      {rows.length ? rows.map(t => { const p = s.plans.find(x => x.topicId === t.id); return (
        <Card key={t.id}><div className="row between wrap gap"><div><h3><Link className="tname" to={`/topics/${t.id}`}>{t.name}</Link></h3><p className="muted"><Link to={`/subjects/${t.subjectId}`}>{s.subjects.find(x => x.id === t.subjectId)?.name}</Link></p></div>
          <button className="btn ghost" onClick={() => setRemoving(t)}><Trash2 size={16} /> Remove</button></div>
          <Priority topicId={t.id} /><p>Progress: {p ? <Badge tone="info">{p.status}</Badge> : <span className="muted">Not in planner</span>}</p></Card>); })
        : <Empty title="No saved topics yet" hint="Save topics from Explore to see them here." action={<Link className="btn" to="/explore">Explore topics</Link>} />}
      <Modal open={!!removing} title="Remove saved topic?" onClose={() => setRemoving(null)}>
        <p>Remove <strong>{removing?.name}</strong> from your Saved Topics? The shared topic and its ratings will not be deleted. You can undo this for a short time.</p>
        <div className="row gap"><button className="btn danger" onClick={async () => { if (!removing) return; const topic = removing; try { await s.toggleSave(topic.id); s.notifyUndo('Topic removed from Saved Topics', async () => { await s.toggleSave(topic.id); s.notify('Topic restored to Saved Topics'); }); setRemoving(null); } catch { /* Keep the dialog available for retry. */ } }}>Remove</button><button className="btn outline" onClick={() => setRemoving(null)}>Cancel</button></div>
      </Modal>
    </>
  );
}
