import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BookOpen, Bookmark, Flame, Plus, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { local } from '../services';
import { pickPunchline } from '../lib/punchlines';
import { AddSubjectModal } from '../components/AddSubjectModal';
import { useStore } from '../context/Store';
import { levelTone, MIN_RATINGS, todayISO } from '../lib/priority';
import { Avatar, Badge, Card, Empty } from '../components/ui';

const initials = (n: string) => n.split(/[^A-Za-z]+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

export default function Overview() {
  const s = useStore(); const [adding, setAdding] = useState(false);
  // One subtitle per dashboard visit, rotating in order. It never changes while the page is open, so there is nothing to restart or announce.
  const [punch] = useState(() => pickPunchline(local.get<string | null>('punchline', null)));
  useEffect(() => { local.set('punchline', String(punch.index)); }, [punch.index]);
  const mine = s.mySubjects;
  const ranked = s.topics.map(t => ({ t, sm: s.summary(t.id) })).filter(x => x.sm && x.sm.n >= MIN_RATINGS).sort((a, b) => b.sm!.score - a.sm!.score);
  const important = ranked.filter(x => x.sm!.level === 'Must Study' || x.sm!.level === 'High Priority').length;
  const due = s.plans.filter(p => p.status !== 'Completed' && p.target <= todayISO());
  const recs = s.seniors.filter(x => x.available && x.subjects.some(id => s.user.savedSubjectIds.includes(id))).slice(0, 3);
  const stats = [
    { label: 'Subjects', value: mine.length, icon: BookOpen, tone: 'purple', to: '/subjects', aria: 'Open My Subjects' }, { label: 'Important Topics', value: important, icon: Flame, tone: 'orange', to: '/explore?level=Important', aria: 'View important topics' },
    { label: 'Saved Topics', value: s.saved.length, icon: Bookmark, tone: 'blue', to: '/saved', aria: 'View saved topics' }, { label: 'Study Streak', value: `${s.user.streak} days`, icon: Target, tone: 'green', to: '/planner?focus=streak', aria: 'Open Study Planner and streak details' },
  ];
  return (
    <>
      <div className="hero">
        <div><p className="eyebrow">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1>Welcome back, {s.user.name.split(' ')[0]}! <span aria-hidden="true">👋</span></h1><p className="sub punchline">{punch.text}</p></div>
        <Link className="btn outline" to="/explore">View all topics <ArrowRight size={18} /></Link>
      </div>
      <div className="stats">{stats.map(x => (
        <Card key={x.label} className="stat"><Link className="arrow-btn" to={x.to} state={{ slide: true }} aria-label={x.aria} title={x.aria}><ArrowUpRight size={16} aria-hidden="true" /></Link><span className={`stat-ico ${x.tone}`}><x.icon size={24} /></span>
          <p className="muted">{x.label}</p><p className="stat-val">{x.value}</p></Card>))}</div>
      <div className="sec-head"><div><p className="eyebrow">Based on student community ratings</p><h2>Top priority topics <span aria-hidden="true">🔥</span></h2></div><Link className="link" to="/explore">See all <ArrowRight size={16} /></Link></div>
      {ranked.length ? <div className="table-wrap"><table className="tbl"><thead><tr><th>Topic</th><th>Subject</th><th>Priority</th><th>Level</th></tr></thead><tbody>
        {ranked.slice(0, 5).map(({ t, sm }) => (
          <tr key={t.id}><td><div className="row gap"><span className="initials">{initials(t.name)}</span><Link className="tname" to={`/topics/${t.id}`}>{t.name}</Link></div></td>
            <td><Link className="muted-link" to={`/subjects/${t.subjectId}`}>{s.subjects.find(x => x.id === t.subjectId)?.name}</Link></td><td><b>{sm!.score}</b><span className="muted">/100</span></td>
            <td><Badge tone={levelTone(sm!.level)}><span className="lvl">{sm!.level}</span></Badge></td></tr>))}</tbody></table></div>
        : <Empty title="No topics have enough ratings yet" hint={`Topics need at least ${MIN_RATINGS} ratings before they show here.`} />}
      <div className="row between wrap gap"><h2 className="h-sm">Your subjects</h2><button className="btn outline" onClick={() => setAdding(true)}><Plus size={16} /> Add subject</button></div>
      <AddSubjectModal open={adding} onClose={() => setAdding(false)} />
      {mine.length ? <div className="grid3">{mine.map(m => <Link key={m.id} className="subject-card-link" to={`/subjects/${m.id}`} aria-label={`Open ${m.name} subject profile`}>
        <Card className="lift"><div className="row between"><h3>{m.name}</h3>{m.status === 'PENDING_REVIEW' && <Badge tone="warn">Pending review</Badge>}</div>
          <p className="muted">{m.code} · Sem {m.semester} · {s.topics.filter(t => t.subjectId === m.id).length} topics</p>
        </Card>
      </Link>)}</div>
        : <Empty title="No subjects selected" hint="Use Add subject to build your list." />}
      <div className="grid2"><div><h2 className="h-sm">Today's study plan</h2>
        {due.length ? due.map(p => <Card key={p.id}><div className="row between"><strong>{s.topics.find(t => t.id === p.topicId)?.name}</strong><Badge tone="info">{p.status}</Badge></div><p className="muted">{p.minutes} min</p></Card>) : <Empty title="Nothing due today" action={<Link className="btn outline" to="/planner">Open planner</Link>} />}</div>
        <div><h2 className="h-sm">Connect & Ask</h2>
          {recs.length ? recs.map(r => <Card key={r.id}><div className="row gap"><Avatar name={r.name} /><div><strong>{r.name}</strong><p className="muted">{r.year}</p></div><Link className="btn outline push" to={`/seniors/${r.id}`}>View profile</Link></div></Card>) : <Empty title="No available helpers for your subjects" hint="Browse opted-in students in Connect & Ask." action={<Link className="btn outline" to="/seniors">Find helpers</Link>} />}</div></div>
    </>
  );
}
