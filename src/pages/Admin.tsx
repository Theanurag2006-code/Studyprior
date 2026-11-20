import { useState, type ReactNode } from 'react';
import { useStore } from '../context/Store';
import { HELPER_MIN_SEMESTER, SEMESTER_YEARS, levelTone, MIN_RATINGS } from '../lib/priority';
import { BRANCHES } from '../data/mock';
import { Badge, Card, DemoBadge, PageHeader } from '../components/ui';

type Row = ReactNode[];
function Table({ head, rows }: { head: string[]; rows: Row[] }) {
  return <div className="table-wrap"><table><thead><tr>{head.map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table></div>;
}
const TABS = ['Overview', 'Users', 'Branches', 'Semesters', 'Subjects', 'Units', 'Topics', 'Ratings', 'Contributions', 'Reports', 'Settings', 'Admin profile'];

export default function Admin() {
  const s = useStore(); const [tab, setTab] = useState('Overview');
  if (s.mode === 'api' && !s.isAdmin) return <><PageHeader back="/" title="Admin Dashboard" /><Card><p><strong>Administrator access required.</strong></p><p className="muted">This page is only for administrator accounts. The server enforces this too.</p></Card></>;
  const nameOf = (id: string) => s.topics.find(t => t.id === id)?.name ?? id;
  const high = s.topics.map(t => ({ t, sm: s.summary(t.id) })).filter(x => x.sm && x.sm.score >= 70);
  const open = s.reports.filter(r => r.status === 'Open');
  const addBtn = (what: string) => <p className="note">Adding {what} from this admin screen is not enabled in this build. Use Share experience for community subjects/topics; fixed academic reference lists are read-only.</p>;
  let body: ReactNode;
  switch (tab) {
    case 'Overview': body = <>
      <div className="grid4">{[['Users', s.metrics?.users ?? s.seniors.length + 1], ['Subjects', s.metrics?.subjects ?? s.subjects.length], ['Topics', s.metrics?.topics ?? s.topics.length], ['Open reports', s.metrics?.openReports ?? open.length]].map(([l, v]) => <Card key={l}><p className="muted">{l}</p><p className="big">{v}</p></Card>)}</div>
      <div className="grid2"><Card><h3>High-priority topics</h3>{high.map(x => <p key={x.t.id}>{x.t.name} <Badge tone={levelTone(x.sm!.level)}>{x.sm!.score}</Badge>{x.sm!.n < MIN_RATINGS && <Badge>Limited data</Badge>}</p>)}</Card>
        <Card><h3>Recent contributions</h3>{s.ratings.slice(-4).reverse().map(r => <p key={r.id}>{nameOf(r.topicId)} <span className="muted">· {r.at}</span></p>)}</Card></div>
      <Card><h3>Moderation queue</h3>{open.length ? open.map(r => <p key={r.id}>{r.target}: {r.reason}</p>) : <p className="muted">Nothing to review.</p>}</Card></>; break;
    case 'Users': body = <><Card className="pad"><div className="row gap wrap"><Badge>Junior · {s.metrics?.juniors ?? s.adminUsers.filter(u => u.accountType === 'Junior').length}</Badge><Badge>Senior · {s.metrics?.seniors ?? s.adminUsers.filter(u => u.accountType === 'Senior').length}</Badge><Badge>Candidate · {s.metrics?.candidates ?? s.adminUsers.filter(u => u.accountType === 'Candidate').length}</Badge></div><p className="muted small">Account category is selected independently from semester.</p></Card><Table head={['Name', 'System role', 'Account category', 'Semester']} rows={s.mode === 'api' ? s.adminUsers.map(u => [u.name, u.role === 'ADMIN' ? 'Administrator' : 'Student', u.accountType ?? '—', u.semester ?? '—']) : [[s.user.name, 'Student', s.user.accountType ?? '—', s.user.semester], ...s.seniors.map(x => [x.name, 'Student', x.accountType, x.semester])]} /></>; break;
    case 'Branches': body = <>{addBtn('branch')}<Table head={['Branch']} rows={BRANCHES.map(b => [b])} /></>; break;
    case 'Semesters': body = <Table head={['Semester']} rows={[1, 2, 3, 4, 5, 6, 7, 8].map(n => [`Semester ${n}`])} />; break;
    case 'Subjects': body = <>{addBtn('subject')}<Table head={['Code', 'Subject', 'Branch', 'Sem']} rows={s.subjects.map(x => [x.code, x.name, x.branch, x.semester])} />
      <h3>Pending review</h3>{s.mode === 'api' ? (s.pending.length ? <Table head={['Subject', 'Branch', 'Sem', 'Topics', 'Added by', 'Action']} rows={s.pending.map(x => [x.name, x.branch, x.semester, x.topics, x.owner,
        <div className="row gap"><button className="btn ghost" onClick={() => { void s.approveSubject(x.id).catch(() => undefined); }}>Approve</button><button className="btn ghost" onClick={() => { if (window.confirm(`Reject and delete "${x.name}"?`)) void s.rejectSubject(x.id).catch(() => undefined); }}>Reject</button></div>])} /> : <p className="muted">Nothing pending review.</p>)
        : (s.allSubjects.some(x => x.status === 'PENDING_REVIEW') ? <Table head={['Subject', 'Branch', 'Sem', 'Status']} rows={s.allSubjects.filter(x => x.status === 'PENDING_REVIEW').map(x => [x.name, x.branch, x.semester, <Badge tone="warn">Pending</Badge>])} /> : <p className="muted">Nothing pending review.</p>)}</>; break;
    case 'Units': body = <>{addBtn('unit')}<Table head={['Unit', 'Subject']} rows={s.units.map(u => [u.name, s.subjects.find(x => x.id === u.subjectId)?.name])} /></>; break;
    case 'Topics': body = <>{addBtn('topic')}<Table head={['Topic', 'Unit']} rows={s.topics.map(t => [t.name, s.units.find(u => u.id === t.unitId)?.name])} /></>; break;
    case 'Ratings': body = <Table head={['Topic', 'User', 'Account category', 'Imp', 'Diff', 'Exam', 'Int']} rows={s.ratings.map(r => [nameOf(r.topicId), r.userId, r.accountType ?? r.level, r.importance, r.difficulty, r.exam, r.interview])} />; break;
    case 'Contributions': body = <Table head={['Topic', 'Advice', 'Date']} rows={s.ratings.map(r => [nameOf(r.topicId), r.advice, r.at])} />; break;
    case 'Reports': body = <Table head={['Target', 'Reason', 'Status', 'Action']} rows={s.reports.map(r => [r.target, r.reason, r.status,
      r.status === 'Open' ? <button className="btn ghost" onClick={() => { void s.resolveReport(r.id).then(() => s.notify(s.mode === 'demo' ? 'Marked resolved (local demo)' : 'Marked resolved')).catch(() => undefined); }}>Resolve</button> : '—'])} />; break;
    case 'Settings': body = <Card><h3>Academic years & helper eligibility</h3><Table head={['Semesters', 'Academic year']} rows={SEMESTER_YEARS.map(y => [`${y.from}–${y.to}`, y.label])} /><p className="muted">Junior, Senior and Candidate are user-selected account categories; they are not derived from semester. Students in semester {HELPER_MIN_SEMESTER} or above may opt in to Connect & Ask by enabling availability and public profile. Minimum ratings for confidence: {MIN_RATINGS}.</p></Card>; break;
    default: body = <Card><p><strong>Admin (sample)</strong></p><p className="muted">Admin accounts are never created through registration.</p></Card>;
  }
  return (
    <>
      <PageHeader back="/" title="Admin Dashboard" sub={s.mode === 'demo' ? 'Preview with sample data. Real access control must be enforced by the backend.' : 'Live data from the server. Only administrator accounts can open this page.'} action={s.mode === 'demo' ? <DemoBadge /> : undefined} />
      <div className="tabs" role="tablist" aria-label="Admin sections">{TABS.map(t => <button key={t} role="tab" aria-selected={tab === t} className={`chip-btn ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>
      {body}
    </>
  );
}
