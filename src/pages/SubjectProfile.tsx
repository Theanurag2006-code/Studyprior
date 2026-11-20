import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { NotebookPen, Plus } from 'lucide-react';
import { ME, useStore } from '../context/Store';
import { MIN_RATINGS, levelTone } from '../lib/priority';
import { subjectStats, themes } from '../lib/stats';
import { AddTopicModal } from '../components/AddTopicModal';
import { NoteModal } from '../components/NoteModal';
import { TopicGraph } from '../components/TopicGraph';
import { BackButton, Badge, Card, Crumbs, Empty } from '../components/ui';
import type { Note, TopicRelationshipType } from '../types';

export default function SubjectProfile() {
  const s = useStore(); const { id } = useParams(); const navigate = useNavigate(); const subj = s.allSubjects.find(x => x.id === id);
  const [q, setQ] = useState(''); const [noteOpen, setNoteOpen] = useState(false); const [editing, setEditing] = useState<Note | undefined>(); const [addingTopic, setAddingTopic] = useState(false);
  const [relationSource, setRelationSource] = useState(''); const [relationTarget, setRelationTarget] = useState(''); const [relationType, setRelationType] = useState<TopicRelationshipType>('PREREQUISITE'); const [savingRelation, setSavingRelation] = useState(false);
  if (!subj) return <><BackButton fallback="/subjects" /><Empty title="This subject isn't available" hint="It may have been removed or is still pending review." action={<Link className="btn" to="/subjects">My Subjects</Link>} /></>;
  const pending = subj.status === 'PENDING_REVIEW'; const inList = s.user.savedSubjectIds.includes(subj.id);
  const topics = s.allTopics.filter(t => t.subjectId === subj.id); const units = s.allUnits.filter(u => u.subjectId === subj.id);
  const subjectRelationships = s.topicRelationships.filter(r => r.subjectId === subj.id);
  const st = subjectStats(topics.map(t => t.id), units.length, s.ratings);
  const rs = s.ratings.filter(r => topics.some(t => t.id === r.topicId)); const th = themes(rs);
  const shown = topics.filter(t => t.name.toLowerCase().includes(q.toLowerCase()));
  const groups = [...new Set(shown.map(t => t.unitId))].map(uid => ({ name: units.find(u => u.id === uid)?.name ?? 'General', items: shown.filter(t => t.unitId === uid) }));
  const ranked = topics.map(t => ({ t, sm: s.summary(t.id) })).filter(x => x.sm && x.sm.n >= MIN_RATINGS).sort((a, b) => b.sm!.n - a.sm!.n || b.sm!.score - a.sm!.score).slice(0, 3);
  const limited = topics.filter(t => { const m = s.summary(t.id); return !m || m.n < MIN_RATINGS; });
  const notes = s.userNotes.filter(n => n.subjectId === subj.id); const open = (n?: Note) => { setEditing(n); setNoteOpen(true); };
  return (
    <>
      <BackButton fallback="/subjects" />
      <Crumbs items={[{ label: 'Subjects', to: '/subjects' }, { label: subj.name }]} />
      <Card className="pad"><div className="row between wrap gap">
        <div className="row gap"><span className="initials big-initials">{subj.name.split(/[^A-Za-z]+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>
          <div><h1>{subj.name}</h1><p className="muted">{subj.code} · {subj.branch} · Semester {subj.semester}</p>
            <div className="row gap wrap">{subj.community && <Badge tone="info">Community-submitted</Badge>}{pending ? <Badge tone="warn">Pending review</Badge> : <Badge tone="ok">Published</Badge>}</div></div></div>
        <div className="row gap wrap"><button className="btn" onClick={async () => { try { if (inList) { if (!window.confirm(`Remove ${subj.name} from My Subjects? The shared catalog will not be deleted.`)) return; await s.removeSubject(subj.id); s.notifyUndo('Subject removed from My Subjects', async () => { await s.addSubjects([subj.id]); s.notify('Subject restored to My Subjects'); }); } else { const r = await s.addSubjects([subj.id]); s.notify(r.added ? 'Added to My Subjects' : 'Already in My Subjects'); } } catch { /* Store reports the failure. */ } }}>{inList ? 'Remove from My Subjects' : 'Add to My Subjects'}</button>
          <button className="btn outline" onClick={() => setAddingTopic(true)}><Plus size={16} /> Add topic</button><button className="btn outline" onClick={() => open()}><NotebookPen size={16} /> Add note</button></div></div>
        <div><h3>About this subject</h3>{subj.description ? <p>{subj.description}</p> : <p className="muted">No description has been added yet.</p>}
          {subj.community && <p className="muted small">Contributed by <strong>{subj.ownerId === ME ? 'You' : subj.author?.name ?? 'Anonymous student contributor'}</strong>{subj.author?.level ? ` · ${subj.author.level}` : ''}</p>}
          <p className="muted small">This description is general subject information. Advice below comes from students and is not official.</p></div>
        {pending && <p className="note">Pending review: visible only to you, and others cannot rate its topics until it is approved.</p>}
      </Card>
      <div className="profile-grid">
        <div>
          <Card className="topic-graph-card">
            <div><h2 className="h-sm">Topic relationship graph</h2><p className="muted small">Map the learning order between topics. A prerequisite points to the topic that depends on it.</p></div>
            <TopicGraph topics={topics} units={units} relationships={subjectRelationships} onOpenTopic={topicId => navigate(`/topics/${topicId}`)} />
            {topics.length >= 2 && <div className="topic-relationship-editor">
              <h3>Connect topics</h3>
              <div className="topic-relationship-fields">
                <label className="field"><span>{relationType === 'PREREQUISITE' ? 'Prerequisite topic' : 'Topic A'}</span>
                  <select className="input" value={relationSource} onChange={e => setRelationSource(e.target.value)} aria-label="First topic">
                    <option value="">Choose a topic…</option>{topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="field"><span>Relationship</span>
                  <select className="input" value={relationType} onChange={e => setRelationType(e.target.value as TopicRelationshipType)} aria-label="Relationship type">
                    <option value="PREREQUISITE">Must be studied before</option><option value="RELATED">Related to</option>
                  </select>
                </label>
                <label className="field"><span>{relationType === 'PREREQUISITE' ? 'Topic that depends on it' : 'Topic B'}</span>
                  <select className="input" value={relationTarget} onChange={e => setRelationTarget(e.target.value)} aria-label="Second topic">
                    <option value="">Choose a topic…</option>{topics.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="row between wrap gap"><p className="muted small">Prerequisite means Topic A should come before Topic B.</p>
                <button className="btn" disabled={!relationSource || !relationTarget || relationSource === relationTarget || savingRelation} onClick={async () => {
                  setSavingRelation(true);
                  try { await s.addTopicRelationship(relationSource, relationTarget, relationType); s.notify('Topic relationship added'); setRelationSource(''); setRelationTarget(''); }
                  catch { /* Store reports the failure. */ }
                  finally { setSavingRelation(false); }
                }}>{savingRelation ? 'Saving…' : 'Add relationship'}</button>
              </div>
            </div>}
            {subjectRelationships.length > 0 && <div className="topic-relationship-list"><h3>Existing links</h3>
              {subjectRelationships.map(r => {
                const from = topics.find(t => t.id === r.sourceTopicId); const to = topics.find(t => t.id === r.targetTopicId);
                return <div className="row between wrap gap topic-relationship-row" key={r.id}>
                  <span>{from?.name ?? 'Topic'} <strong>{r.type === 'PREREQUISITE' ? '→' : '↔'}</strong> {to?.name ?? 'Topic'} <small className="muted">· {r.type === 'PREREQUISITE' ? 'Prerequisite' : 'Related'}</small></span>
                  {r.isMine && <button className="btn ghost" onClick={async () => {
                    if (!window.confirm('Remove this topic relationship? The topics themselves will remain. You can undo this for a short time.')) return;
                    try {
                      await s.removeTopicRelationship(r.sourceTopicId, r.id);
                      s.notifyUndo('Topic relationship removed', async () => {
                        await s.addTopicRelationship(r.sourceTopicId, r.targetTopicId, r.type);
                        s.notify('Topic relationship restored');
                      });
                    } catch { /* Store reports the failure. */ }
                  }}>Remove</button>}
                </div>;
              })}
            </div>}
          </Card>
          <div className="row between wrap gap"><h2 className="h-sm">Units and topics</h2><input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Filter topics" aria-label="Filter topics in this subject" /></div>
          {groups.length ? groups.map(g => (
            <Card key={g.name}><h3>{g.name}</h3>{g.items.map(t => { const m = s.summary(t.id); return (
              <div key={t.id} className="row between wrap gap topic-row"><div><Link className="tname" to={`/topics/${t.id}`}>{t.name}</Link>
                <p className="muted small">{m ? `${m.n} rating${m.n === 1 ? '' : 's'}` : 'No ratings yet.'}{t.hours ? ` · ~${t.hours} h` : ''}</p></div>
                <div className="row gap wrap">{m && <><b>{m.score}</b><Badge tone={levelTone(m.level)}><span className="lvl">{m.level}</span></Badge><Badge tone={m.confidence === 'Broader community signal' ? 'ok' : 'neutral'}>{m.confidence}</Badge></>}
                  <Link className="btn ghost" to={`/topics/${t.id}`}>Open</Link></div></div>); })}</Card>))
            : <Empty title={topics.length ? 'No topics match your filter' : 'No topics yet'} hint={topics.length ? 'Clear the filter to see all topics.' : 'Add the first topic to start collecting feedback.'} action={!topics.length ? <button className="btn" onClick={() => setAddingTopic(true)}>Add topic</button> : undefined} />}
          <h2 className="h-sm">Community highlights</h2>
          <div className="grid2"><Card><h3>Strongest consensus</h3><p className="muted small">Topics with at least {MIN_RATINGS} ratings, most ratings first.</p>
            {ranked.length ? ranked.map(x => <p key={x.t.id}><Link to={`/topics/${x.t.id}`}>{x.t.name}</Link> · {x.sm!.score}/100 · {x.sm!.n} ratings</p>) : <p className="muted">No topic has enough ratings yet.</p>}</Card>
            <Card><h3>Limited data</h3><p className="muted small">Fewer than {MIN_RATINGS} ratings (or none), so treat as preliminary.</p>
              {limited.length ? limited.map(t => <p key={t.id}><Link to={`/topics/${t.id}`}>{t.name}</Link> · {s.summary(t.id) ? `${s.summary(t.id)!.n} rating` : 'No ratings yet'}</p>) : <p className="muted">Every topic has enough ratings.</p>}</Card></div>
          <Card><h3>Recurring words in student advice</h3>
            {th.length ? <><div className="row gap wrap">{th.map(x => <Badge key={x.word} tone="info">{x.word} · {x.users} students</Badge>)}</div><p className="muted small">Words used by at least two different students. These are community themes drawn from saved advice, not official facts.</p></>
              : <p className="muted">Not enough written advice yet to show common themes.</p>}</Card>
          <h2 className="h-sm">My notes <span className="muted small">({s.mode === 'demo' ? 'private, stored on this device' : 'private, saved to your account'})</span></h2>
          {notes.length ? notes.map(n => <Card key={n.id}><button className="note-row" onClick={() => open(n)} aria-label={`Open note ${n.title}`}><span><strong>{n.title}</strong><span className="muted block small">{n.body.slice(0, 120)}{n.body.length > 120 ? '…' : ''}</span></span><small className="muted">Edit</small></button></Card>) : <p className="muted">No notes yet.</p>}
        </div>
        <aside className="side-panel" aria-label="Subject summary"><Card>
          <h3>At a glance</h3><p className="muted small">Totals across this subject's topics (the product has no separate subject rating).</p>
          <dl className="kv">
            <dt>Units</dt><dd>{st.units}</dd><dt>Topics</dt><dd>{st.topics}</dd>
            <dt title="Sum of rating records across all topics. One person rating five topics counts five times here.">Ratings across topics</dt><dd>{st.votes}</dd>
            <dt title="Ratings that include non-empty written advice.">Written feedback</dt><dd>{st.feedback}</dd>
            <dt title="Unique advice texts across the subject.">Distinct descriptions</dt><dd>{st.distinctDescriptions}</dd>
            <dt title="Distinct students across all topics, each counted once.">Contributors</dt><dd>{st.contributors}</dd></dl>
          <h3>Topic priority mix</h3>
          {st.withConsensus ? Object.entries(st.levels).map(([l, n]) => <div key={l} className="kvrow"><dt>{l}</dt><dd>{n}</dd></div>) : <p className="muted small">No topic has {MIN_RATINGS}+ ratings yet.</p>}
          <p className="muted small">{st.limited} limited data · {st.unrated} unrated</p>
        </Card></aside>
      </div>
      <AddTopicModal open={addingTopic} onClose={() => setAddingTopic(false)} subjectId={subj.id} />
      <NoteModal open={noteOpen} onClose={() => setNoteOpen(false)} subjectId={subj.id} note={editing} />
    </>
  );
}
