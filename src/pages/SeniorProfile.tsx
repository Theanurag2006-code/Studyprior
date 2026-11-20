import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowUpRight, BookOpen, FileText, MessageCircle, ThumbsUp } from 'lucide-react';
import { server } from '../services';
import { useStore } from '../context/Store';
import type { SeniorFeedItem, SeniorFeedPage, SeniorProfileData } from '../types';
import { Avatar, Badge, BackButton, Card, DemoBadge, Empty, Spinner } from '../components/ui';

const blankStats = { subjectsSubmitted: 0, subjectsPublished: 0, subjectsPending: 0, topicsSubmitted: 0, topicsPublished: 0, ratingsSubmitted: 0, writtenExplanations: 0, helpfulVotesReceived: 0, totalPublishedContributions: 0 };
const emptyFeed: SeniorFeedPage = { items: [], total: 0, offset: 0, limit: 20, hasMore: false };
const dateLabel = (raw: string) => { const d = new Date(raw); return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };

export default function SeniorProfile() {
  const s = useStore(); const { id = '' } = useParams(); const nav = useNavigate();
  const [data, setData] = useState<SeniorProfileData | null>(null); const [feed, setFeed] = useState<SeniorFeedPage | null>(null);
  const [loading, setLoading] = useState(true); const [moreLoading, setMoreLoading] = useState(false); const [error, setError] = useState(''); const [busyVote, setBusyVote] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (server) {
        const [profile, posts] = await Promise.all([server.getSeniorProfile(id), server.getSeniorFeed(id, 0, 20)]);
        setData(profile); setFeed(posts);
      } else {
        const sample = s.seniors.find(x => x.id === id);
        if (!sample) { setData(null); setFeed(emptyFeed); setError('This sample profile is not available.'); return; }
        const subjects = [...new Set(sample.subjects)].map(subjectId => s.allSubjects.find(x => x.id === subjectId)).filter((x): x is NonNullable<typeof x> => !!x).map(x => ({ id: x.id, name: x.name }));
        setData({ profile: { id: sample.id, name: sample.name, accountType: sample.accountType, branch: sample.branch, department: sample.branch, college: 'Sample institution', semester: sample.semester, year: sample.year, graduationYear: 0, bio: sample.bio, available: sample.available, publicProfile: true, joined: '', isOwnProfile: false, subjects }, stats: { ...blankStats, totalPublishedContributions: sample.contributions } });
        setFeed(emptyFeed);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load this student profile.'); }
    finally { setLoading(false); }
  }, [id, s.mode, s.seniors, s.allSubjects]);
  useEffect(() => { void load(); }, [load]);

  const loadMore = async () => {
    if (!server || !feed || !feed.hasMore || moreLoading) return;
    setMoreLoading(true);
    try { const next = await server.getSeniorFeed(id, feed.items.length, feed.limit); setFeed(prev => prev ? { ...next, items: [...prev.items, ...next.items] } : next); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load more contributions.'); }
    finally { setMoreLoading(false); }
  };

  const toggleHelpful = async (item: SeniorFeedItem) => {
    if (!server || !data || data.profile.isOwnProfile || busyVote) return;
    setBusyVote(`${item.type}:${item.id}`); setError('');
    try {
      const response = await server.setContributionHelpful(item.type, item.id, !item.isHelpful);
      setFeed(prev => prev ? { ...prev, items: prev.items.map(x => x.id === item.id && x.type === item.type ? { ...x, helpfulCount: response.helpfulCount, isHelpful: response.isHelpful } : x) } : prev);
      // Refresh the totals from the source of truth so the profile stays in sync across screens.
      const fresh = await server.getSeniorProfile(id); setData(fresh);
    } catch (e) { setError(e instanceof Error ? e.message : 'Your feedback could not be saved. Please try again.'); }
    finally { setBusyVote(null); }
  };

  const ask = async () => {
    if (!data || data.profile.isOwnProfile) return;
    try { const subject = data.profile.subjects[0]?.name ?? 'my studies'; const conversationId = await s.startConvo(data.profile.id, `Hi ${data.profile.name.split(' ')[0]}, I would appreciate your advice about ${subject}.`); nav(`/messages/${conversationId}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not open a conversation.'); }
  };

  if (loading) return <><BackButton fallback="/seniors" /><Spinner label="Loading student profile" /></>;
  if (!data) return <><BackButton fallback="/seniors" /><Empty title="Student profile unavailable" hint={error || 'This profile may be private or no longer available.'} action={<Link className="btn" to="/seniors">Back to Connect & Ask</Link>} /></>;
  const p = data.profile; const st = data.stats; const demo = s.mode === 'demo';
  const statCards = [
    { label: 'Published subjects', value: st.subjectsPublished, icon: BookOpen },
    { label: 'Published topics', value: st.topicsPublished, icon: FileText },
    { label: 'Written explanations', value: st.writtenExplanations, icon: MessageCircle },
    { label: 'Helpful votes received', value: st.helpfulVotesReceived, icon: ThumbsUp },
  ];
  return (
    <>
      <BackButton fallback="/seniors" />
      <div className="page-head"><div><p className="eyebrow">Student helper profile</p><h1>{p.name}</h1><p className="muted">{p.accountType} · Semester {p.semester} · {p.branch} · {p.year}{p.graduationYear ? ` · Graduation ${p.graduationYear}` : ''}</p></div>
        {p.isOwnProfile ? <Link className="btn" to="/profile/edit">Edit my profile <ArrowUpRight size={16} /></Link> : <button className="btn" disabled={!p.available} onClick={() => void ask()}><MessageCircle size={16} /> {p.available ? 'Ask this student' : 'Not accepting questions'}</button>}</div>
      {demo && <p className="note"><DemoBadge /> Sample profile preview. Real contribution analytics and voting are available when the API is connected.</p>}
      {error && <p className="err" role="alert">{error}</p>}
      <Card className="pad">
        <div className="row gap"><Avatar name={p.name} size={76} /><div className="profile-summary"><div className="row gap wrap"><Badge tone={p.available ? 'ok' : 'neutral'}>{p.available ? 'Open to questions' : 'Not available for new conversations'}</Badge><Badge>{p.isOwnProfile ? 'Your profile' : `${p.accountType} · Available helper`}</Badge></div>
          <p>{p.bio || 'No bio added yet.'}</p><p className="muted small">{p.college}{p.department ? ` · ${p.department}` : ''}{p.joined ? ` · Member since ${dateLabel(p.joined)}` : ''}</p></div></div>
        <h3 className="h-sm">Academic contributions</h3>
        {p.subjects.length ? <div className="row gap wrap">{p.subjects.map(x => <Link key={x.id} className="chip-btn" to={`/subjects/${x.id}`}>{x.name} <ArrowUpRight size={14} /></Link>)}</div> : <p className="muted">No published subject or topic contributions yet.</p>}
      </Card>
      {!demo && <><h2 className="h-sm">Contribution statistics</h2><div className="stats">{statCards.map(x => <Card key={x.label} className="stat"><span className="stat-ico blue"><x.icon size={22} /></span><p className="muted">{x.label}</p><p className="stat-val">{x.value}</p></Card>)}</div>
        <Card><h3>Contribution status</h3><dl className="kv"><dt>Subjects submitted</dt><dd>{st.subjectsSubmitted}</dd><dt>Subjects published</dt><dd>{st.subjectsPublished}</dd><dt>Subjects pending review</dt><dd>{p.isOwnProfile ? st.subjectsPending : '—'}</dd><dt>Topics submitted</dt><dd>{st.topicsSubmitted}</dd><dt>Topics published</dt><dd>{st.topicsPublished}</dd><dt>Ratings submitted</dt><dd>{st.ratingsSubmitted}</dd><dt>Total published contributions</dt><dd>{st.totalPublishedContributions}</dd></dl><p className="muted small">Pending submission counts are shown only to the author. Published counts come from public database records.</p></Card></>}
      <div className="sec-head"><div><p className="eyebrow">Public academic activity</p><h2>Contribution feed</h2></div><span className="muted small">{demo ? 'Demo preview' : `${feed?.total ?? 0} contributions`}</span></div>
      {feed?.items.length ? <div className="stack">{feed.items.map(item => <Card key={`${item.type}:${item.id}`} className="lift">
        <div className="row between wrap gap"><div><Badge>{item.type === 'subject' ? 'Subject' : item.type === 'topic' ? 'Topic' : 'Written feedback'}</Badge><h3 className="feed-title">{item.title}</h3><p className="muted small">{item.subtitle} · {dateLabel(item.createdAt)}</p></div><span className="muted small"><ThumbsUp size={14} /> {item.helpfulCount} helpful</span></div>
        {item.body && <p className="feed-body">{item.body}</p>}
        {item.mistakes && item.advice && <p><strong>Common mistake:</strong> {item.mistakes}</p>}
        <div className="row between wrap gap"><div className="row gap wrap">{item.subjectId && <Link className="btn ghost" to={`/subjects/${item.subjectId}`}>Open subject</Link>}{item.topicId && <Link className="btn ghost" to={`/topics/${item.topicId}`}>Open topic <ArrowUpRight size={14} /></Link>}</div>
          {!demo && !p.isOwnProfile && <button className={`btn ${item.isHelpful ? 'outline' : 'ghost'}`} disabled={busyVote === `${item.type}:${item.id}`} aria-pressed={item.isHelpful} onClick={() => void toggleHelpful(item)}><ThumbsUp size={15} /> {busyVote === `${item.type}:${item.id}` ? 'Saving…' : item.isHelpful ? 'Marked helpful' : 'Helpful'}</button>}</div>
      </Card>)}{feed?.hasMore && <button className="btn outline" disabled={moreLoading} onClick={() => void loadMore()}>{moreLoading ? 'Loading…' : 'Load more contributions'}</button>}</div>
        : <Empty title="No public contributions yet" hint={demo ? 'Sample helper profiles do not have a real contribution feed.' : 'Published subjects, topics, and written academic feedback will appear here.'} />}
      {p.available && !p.isOwnProfile && <Card className="pad"><div className="row between wrap gap"><div><h3>Have an academic question?</h3><p className="muted">Start a private conversation with this opted-in student. Your message is sent when you press Send.</p></div><button className="btn" onClick={() => void ask()}><MessageCircle size={16} /> Ask {p.name.split(' ')[0]}</button></div></Card>}
    </>
  );
}
