import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Bookmark, BookmarkCheck, CalendarPlus, Star } from 'lucide-react';
import { ME, useStore } from '../context/Store';
import { server } from '../services';
import type { ApiRatingSummary, ApiTopicSummary, Summary } from '../types';
import { MIN_RATINGS, levelTone, summarize as summarizeRatings } from '../lib/priority';
import { clean, contribStats, DIMS, distribution, type Dist } from '../lib/stats';
import { Avatar, BackButton, Badge, Card, Crumbs, Empty } from '../components/ui';
import type { Rating } from '../types';

function DimCard({ d, label, tip }: { d: Dist; label: string; tip: string }) {
  return (
    <Card>
      <div className="row between wrap gap"><h3 title={tip}>{label}</h3>{d.mean === null ? <span className="muted">No ratings yet</span> : <span className="mean"><b>{d.mean.toFixed(1)}</b>/5</span>}</div>
      <p className="muted small">{d.votes} rating{d.votes === 1 ? '' : 's'} for {label.toLowerCase()}. Percentages are shares of these {d.votes}.</p>
      {d.votes > 0 && [4, 3, 2, 1, 0].map(i => (
        <div key={i} className="dist-row"><span className="dist-label">{i + 1}★</span>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.percents[i]} aria-label={`${i + 1} stars: ${d.percents[i]} percent (${d.counts[i]} of ${d.votes})`}><span style={{ width: `${d.percents[i]}%` }} /></div>
          <span className="dist-val">{d.percents[i]}% <span className="muted">({d.counts[i]})</span></span></div>))}
    </Card>
  );
}
const SORTS: Record<string, [string, (a: Rating, b: Rating) => number]> = {
  recent: ['Most recent', (a, b) => b.at.localeCompare(a.at)], importance: ['Highest importance', (a, b) => b.importance - a.importance || b.at.localeCompare(a.at)],
  exam: ['Highest exam relevance', (a, b) => b.exam - a.exam || b.at.localeCompare(a.at)], interview: ['Highest interview relevance', (a, b) => b.interview - a.interview || b.at.localeCompare(a.at)],
};

const mapApiSummary = (x: ApiRatingSummary): Summary | null => x.sampleCount > 0 && x.means && x.priorityScore !== null && x.priorityLabel
  ? { n: x.sampleCount, importance: x.means.importance, difficulty: x.means.difficulty, exam: x.means.exam, interview: x.means.interview, score: x.priorityScore, level: x.priorityLabel, confidence: x.confidence.label as Summary['confidence'] }
  : null;
function SummaryTile({ title, summary, empty }: { title: string; summary: Summary | null; empty: string }) {
  return <Card><h3>{title}</h3>{summary ? <><div className="row gap wrap"><strong className="score">{summary.score}<span className="muted small">/100</span></strong><Badge tone={levelTone(summary.level)}><span className="lvl">{summary.level}</span></Badge></div><p className="muted small">{summary.n} unique rating{summary.n === 1 ? '' : 's'} · {summary.confidence}</p><dl className="kv"><dt>Importance</dt><dd>{summary.importance.toFixed(1)}/5</dd><dt>Exam relevance</dt><dd>{summary.exam.toFixed(1)}/5</dd><dt>Interview relevance</dt><dd>{summary.interview.toFixed(1)}/5</dd><dt>Difficulty (separate)</dt><dd>{summary.difficulty.toFixed(1)}/5</dd></dl></> : <p className="muted">{empty}</p>}</Card>;
}

export default function TopicProfile() {
  const s = useStore(); const nav = useNavigate(); const { topicId } = useParams();
  const [sort, setSort] = useState('recent'); const [lv, setLv] = useState('All'); const [written, setWritten] = useState(false); const [apiSummary, setApiSummary] = useState<ApiTopicSummary | null>(null);
  useEffect(() => { let active = true; setApiSummary(null); if (!server || !topicId) { return () => { active = false; }; } server.getTopicSummary(topicId).then(x => { if (active) setApiSummary(x); }).catch(() => { if (active) setApiSummary(null); }); return () => { active = false; }; }, [topicId, s.mode]);
  const topic = s.allTopics.find(t => t.id === topicId);
  if (!topic) return <><BackButton fallback="/explore" /><Empty title="Topic not found" hint="It may have been removed or is still pending review." action={<Link className="btn" to="/explore">Explore topics</Link>} /></>;
  const subj = s.allSubjects.find(x => x.id === topic.subjectId); const unit = s.allUnits.find(u => u.id === topic.unitId);
  const rs = s.ratings.filter(r => r.topicId === topic.id); const sm = apiSummary ? mapApiSummary(apiSummary.overall) : s.summary(topic.id); const seniorSm = apiSummary ? mapApiSummary(apiSummary.senior) : (rs.some(r => r.accountType === 'Senior' || r.level === 'Senior') ? summarizeRatings(rs.filter(r => (r.accountType ?? r.level) === 'Senior')) : null); const juniorSm = apiSummary ? mapApiSummary(apiSummary.junior) : (rs.some(r => r.accountType === 'Junior' || r.level === 'Junior') ? summarizeRatings(rs.filter(r => (r.accountType ?? r.level) === 'Junior')) : null); const candidateSm = apiSummary ? mapApiSummary(apiSummary.candidate) : (rs.some(r => r.accountType === 'Candidate' || r.level === 'Candidate') ? summarizeRatings(rs.filter(r => (r.accountType ?? r.level) === 'Candidate')) : null); const cs = contribStats(rs); const dists = DIMS.map(d => distribution(rs, d.key));
  const mine = rs.find(r => r.userId === ME); const saved = s.saved.includes(topic.id); const planned = s.plans.some(p => p.topicId === topic.id);
  const feed = rs.filter(r => (lv === 'All' || r.level === lv) && (!written || clean(r.advice))).sort(SORTS[sort][1]);
  const who = (r: Rating) => { if (r.userId === ME) return { name: 'You', meta: `${r.level} · ${s.user.branch}` }; const p = s.contributors[r.userId]; return p?.public ? { name: p.name, meta: `${p.level} · ${p.branch}` } : { name: 'Anonymous student', meta: '' }; };
  return (
    <>
      <BackButton fallback={`/subjects/${topic.subjectId}`} />
      <Crumbs items={[{ label: 'Subjects', to: '/subjects' }, { label: subj?.name ?? 'Subject', to: `/subjects/${topic.subjectId}` }, ...(unit ? [{ label: unit.name }] : []), { label: topic.name }]} />
      <Card className="pad">
        <div className="row between wrap gap"><div><h1>{topic.name}</h1>
          <p className="muted">{subj && <Link to={`/subjects/${subj.id}`}>{subj.name}</Link>}{unit ? ` · ${unit.name}` : ''}{topic.hours ? ` · about ${topic.hours} h` : ''}</p></div>
          {!sm ? <p className="muted">No ratings yet.</p> : <div className="row gap wrap"><span className="score big">{sm.score}<span className="muted small">/100</span></span><Badge tone={levelTone(sm.level)}><span className="lvl">{sm.level}</span></Badge>
            <span title="Confidence reflects only how many ratings there are. It does not change the score."><Badge tone={sm.confidence === 'Broader community signal' ? 'ok' : 'neutral'}>{sm.confidence === 'Limited data' ? `Limited data (under ${MIN_RATINGS} ratings)` : `${sm.confidence}`}</Badge></span></div>}</div>
        {topic.description ? <p>{topic.description}</p> : <p className="muted">No description has been added for this topic yet.</p>}
        {topic.author && <p className="muted small">Contributed by <strong>{topic.author.name}</strong>{topic.author.level ? ` · ${topic.author.level}` : ''}</p>}
        <p className="muted small">Priority uses normalized Importance (4/9), Exam relevance (3/9), and Interview relevance (2/9). Difficulty is independent and does not affect Priority. Based on {cs.votes} community rating{cs.votes === 1 ? '' : 's'}; it is not an official ranking.</p>
        <div className="row gap wrap">
          <Link className="btn" to={`/share?topic=${topic.id}`}><Star size={16} /> {mine ? 'Edit your rating' : 'Rate this topic'}</Link>
          <button className="btn outline" onClick={async () => { try { if (saved && !window.confirm(`Remove ${topic.name} from Saved Topics?`)) return; await s.toggleSave(topic.id); if (saved) s.notifyUndo('Topic removed from Saved Topics', async () => { await s.toggleSave(topic.id); s.notify('Topic restored to Saved Topics'); }); else s.notify('Saved topic'); } catch { /* Store reports the failure. */ } }} aria-pressed={saved}>{saved ? <BookmarkCheck size={16} /> : <Bookmark size={16} />} {saved ? 'Unsave' : 'Save'}</button>
          <button className="btn outline" disabled={planned} title={planned ? 'Already in your planner' : undefined} onClick={async () => { try { await s.addPlan({ topicId: topic.id, target: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10), minutes: topic.hours ? Math.round(topic.hours * 60) : 60, status: 'Planned' }); s.notify(s.mode === 'demo' ? 'Added to planner on this device' : 'Added to your planner'); nav('/planner'); } catch { /* Store reports the failure. */ } }}><CalendarPlus size={16} /> {planned ? 'In planner' : 'Add to planner'}</button></div>
      </Card>
      <h2 className="h-sm">Community rating breakdown by account category</h2>
      <div className="grid2">
        <SummaryTile title="Overall community" summary={apiSummary ? mapApiSummary(apiSummary.overall) : sm} empty="Not enough ratings to calculate a score." />
        <SummaryTile title="Junior ratings" summary={juniorSm} empty="No Junior ratings yet." />
        <SummaryTile title="Senior ratings" summary={seniorSm} empty="No Senior ratings yet." />
        <SummaryTile title="Candidate ratings" summary={candidateSm} empty="No Candidate ratings yet." />
      </div>
      <div className="profile-grid">
        <div>
          <h2 className="h-sm">Ratings by dimension</h2>
          <div className="grid2">{dists.map((d, i) => <DimCard key={d.dim} d={d} label={DIMS[i].label} tip={DIMS[i].tip} />)}</div>
          <h2 className="h-sm">What students say</h2>
          <p className="muted small">Written advice from students who rated this topic. Ratings without text are counted as votes but not as feedback.</p>
          <div className="row gap wrap" role="group" aria-label="Feedback filters">
            <select className="input" aria-label="Sort feedback" value={sort} onChange={e => setSort(e.target.value)}>{Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
            {['All', 'Junior', 'Senior', 'Candidate'].map(l => <button key={l} className={`chip-btn ${lv === l ? 'on' : ''}`} aria-pressed={lv === l} onClick={() => setLv(l)}>{l === 'All' ? 'All students' : l}</button>)}
            <label className="row gap check"><input type="checkbox" checked={written} onChange={e => setWritten(e.target.checked)} /> With written advice only</label></div>
          {feed.length ? feed.map(r => { const w = who(r); const sample = s.mode === 'demo' && r.userId !== ME; return (
            <Card key={r.id} className={r.userId === ME ? 'lift mine' : 'lift'}>
              <div className="row between wrap gap"><div className="row gap"><Avatar name={w.name === 'You' ? s.user.name : w.name} /><div><strong>{w.name}</strong>{w.meta && <p className="muted small">{w.meta}</p>}</div></div>
                <div className="row gap wrap">{r.userId === ME && <Badge tone="info">Your rating</Badge>}{sample && <Badge tone="demo">Sample data</Badge>}<span className="muted small">Updated {r.at}</span></div></div>
              <div className="row gap wrap"><Badge>Importance {r.importance}/5</Badge><Badge>Difficulty {r.difficulty}/5</Badge><Badge>Exam {r.exam}/5</Badge><Badge>Interview {r.interview}/5</Badge></div>
              {clean(r.advice) ? <p className="advice">{clean(r.advice)}</p> : <p className="muted">Rated without written feedback.</p>}
              {clean(r.mistakes) && <p><strong>Common mistake:</strong> {clean(r.mistakes)}</p>}
              {r.userId === ME && <div><Link className="btn ghost" to={`/share?topic=${topic.id}`}>Edit your rating</Link></div>}</Card>); })
            : <Empty title={rs.length ? 'No feedback matches these filters' : 'No ratings yet'} hint={rs.length ? 'Clear a filter to see more.' : 'Be the first to rate this topic.'} />}
        </div>
        <aside className="side-panel" aria-label="Topic summary"><Card>
          <h3>Community overview</h3>
          <dl className="kv">
            <dt title="Rating records (one per student).">Total ratings</dt><dd>{cs.votes}</dd>
            <dt title="Ratings that include non-empty written advice.">Written feedback</dt><dd>{cs.feedback}</dd>
            <dt title="Unique advice texts (same text counted once).">Distinct descriptions</dt><dd>{cs.distinctDescriptions}</dd>
            <dt title="Ratings that include a common-mistake note.">Mistake tips</dt><dd>{cs.mistakes}</dd>
            <dt title="Distinct students who rated.">Contributors</dt><dd>{cs.contributors}</dd></dl>
          <h3>Mean scores</h3>
          <dl className="kv">{dists.map((d, i) => <div key={d.dim} className="kvrow"><dt>{DIMS[i].label}</dt><dd>{d.mean === null ? '—' : `${d.mean.toFixed(1)}/5`}</dd></div>)}</dl>
          <p className="muted small" title="Limited data means fewer than 3 ratings; 3-5 is an early signal; 6 or more is a broader community signal.">Confidence: <b>{sm ? sm.confidence : 'No ratings yet'}</b></p>
        </Card></aside>
      </div>
    </>
  );
}
