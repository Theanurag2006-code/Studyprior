import { useState } from 'react';
import { Bookmark, BookmarkCheck, CalendarPlus, Info, Star } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../context/Store';
import { levelTone, MIN_RATINGS } from '../lib/priority';
import type { Topic } from '../types';
import { Badge, Card, Modal } from './ui';

export function Priority({ topicId }: { topicId: string }) {
  const { summary } = useStore();
  const s = summary(topicId);
  if (!s) return <p className="muted">No ratings yet.</p>;
  return (
    <div className="row wrap gap">
      <strong className="score">{s.score}</strong>
      <Badge tone={levelTone(s.level)}>{s.level}</Badge>
      <span className="muted">{s.n} student rating{s.n === 1 ? '' : 's'}</span>
      <Badge tone={s.confidence === 'Broader community signal' ? 'ok' : 'neutral'}>{s.confidence === 'Limited data' ? `Limited data (<${MIN_RATINGS} ratings)` : `${s.confidence}`}</Badge>
    </div>
  );
}

export function TopicCard({ topic }: { topic: Topic }) {
  const s = useStore(); const nav = useNavigate(); const [open, setOpen] = useState(false);
  const subject = s.subjects.find(x => x.id === topic.subjectId); const unit = s.units.find(x => x.id === topic.unitId);
  const isSaved = s.saved.includes(topic.id); const sum = s.summary(topic.id);
  const advice = s.ratings.filter(r => r.topicId === topic.id);
  const planned = s.plans.some(p => p.topicId === topic.id);
  return (
    <Card className="topic lift">
      <div className="row between"><div><h3><Link className="tname" to={`/topics/${topic.id}`}>{topic.name}</Link></h3><p className="muted">{subject ? <Link to={`/subjects/${subject.id}`}>{subject.name}</Link> : null} · {unit?.name}</p></div>
        <button className="icon-btn" onClick={async () => { try { if (isSaved && !window.confirm(`Remove ${topic.name} from Saved Topics?`)) return; await s.toggleSave(topic.id); if (isSaved) s.notifyUndo('Topic removed from Saved Topics', async () => { await s.toggleSave(topic.id); s.notify('Topic restored to Saved Topics'); }); else s.notify('Saved topic'); } catch { /* Store reports the failure. */ } }} aria-pressed={isSaved} aria-label={isSaved ? `Unsave ${topic.name}` : `Save ${topic.name}`}>
          {isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}</button></div>
      <Priority topicId={topic.id} />
      <div className="row gap wrap">
        <button className="btn ghost" onClick={() => nav(`/topics/${topic.id}`)}><Info size={16} /> Details</button>
        <button className="btn ghost" disabled={planned} title={planned ? 'Already in your planner' : undefined}
          onClick={async () => { try { await s.addPlan({ topicId: topic.id, target: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), minutes: 60, status: 'Planned' }); s.notify(s.mode === 'demo' ? 'Added to planner on this device' : 'Added to your planner'); nav('/planner'); } catch { /* Store reports the failure. */ } }}>
          <CalendarPlus size={16} /> {planned ? 'In planner' : 'Add to planner'}</button>
        <button className="btn ghost" onClick={() => nav(`/share?topic=${topic.id}`)}><Star size={16} /> Rate this topic</button>
      </div>
      
    </Card>
  );
}
