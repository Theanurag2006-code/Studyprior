import { useSearchParams } from 'react-router-dom';
import { useStore } from '../context/Store';
import { LEVELS, MIN_RATINGS } from '../lib/priority';
import { TopicCard } from '../components/TopicCard';
import { Empty, PageHeader } from '../components/ui';

export default function Explore() {
  const s = useStore(); const [sp, setSp] = useSearchParams();
  const q = (sp.get('q') ?? '').trim().toLowerCase(); const lvl = sp.get('level') ?? 'All';
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); v && v !== 'All' ? n.set(k, v) : n.delete(k); setSp(n); };
  const rows = s.topics.filter(t => {
    const subj = s.subjects.find(x => x.id === t.subjectId);
    const hit = !q || [t.name, subj?.name, subj?.code].some(x => x?.toLowerCase().includes(q));
    const sm = s.summary(t.id);
    const levelOk = lvl === 'All' || (lvl === 'Important' ? !!sm && sm.n >= MIN_RATINGS && (sm.level === 'Must Study' || sm.level === 'High Priority') : sm?.level === lvl);
    return hit && levelOk;
  }).sort((a, b) => (s.summary(b.id)?.score ?? -1) - (s.summary(a.id)?.score ?? -1));
  return (
    <>
      <PageHeader back="/" title="Explore Topics" sub="Priority comes from community ratings; Junior, Senior and Candidate account-category views are shown separately on topic details. Small samples are flagged." />
      <div className="row gap wrap">
        <input className="input" value={sp.get('q') ?? ''} onChange={e => set('q', e.target.value)} placeholder="Search topics or subjects" aria-label="Search topics or subjects" />
        <div className="row gap wrap" role="group" aria-label="Priority filter">{['All', 'Important', ...LEVELS].map(l => <button key={l} className={`chip-btn ${lvl === l ? 'on' : ''}`} aria-pressed={lvl === l} onClick={() => set('level', l)}>{l}</button>)}</div>
      </div>
      <p className="muted" aria-live="polite">{rows.length} result{rows.length === 1 ? '' : 's'}</p>
      {rows.length ? <div className="grid2">{rows.map(t => <TopicCard key={t.id} topic={t} />)}</div> : <Empty title="No topics match" hint="Try another search or filter." />}
    </>
  );
}
