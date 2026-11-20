import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, BookOpen, Bookmark, CalendarDays, ChevronDown, Compass, Flame, LayoutGrid, LogOut, Menu, MessageSquare, Moon, Search, Share2, Shield, Sun, User as UserIcon, Users } from 'lucide-react';
import { useStore, type Theme } from '../context/Store';
import { Avatar, Empty, Logo, Spinner } from './ui';

const main = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true }, { to: '/explore', label: 'Explore topics', icon: Compass },
  { to: '/saved', label: 'Saved topics', icon: Bookmark }, { to: '/planner', label: 'Study planner', icon: CalendarDays }, { to: '/share', label: 'Share experience', icon: Share2 },
];
const more = [
  { to: '/subjects', label: 'Subjects', icon: BookOpen }, { to: '/seniors', label: 'Connect & Ask', icon: Users },
  { to: '/messages', label: 'Messages', icon: MessageSquare }, { to: '/notifications', label: 'Notifications', icon: Bell }, { to: '/admin', label: 'Admin dashboard (preview)', icon: Shield },
];
const themes: { v: Theme; icon: typeof Sun; label: string }[] = [{ v: 'light', icon: Sun, label: 'Light' }, { v: 'dark', icon: Moon, label: 'Dark' }];


export function Shell() {
  const s = useStore(); const nav = useNavigate(); const loc = useLocation(); const [open, setOpen] = useState(false); const [q, setQ] = useState('');
  const unread = s.notes.filter(n => !n.read).length;
  const unreadDirect = s.convos.reduce((total, c) => total + c.unread, 0);
  const unreadGroups = s.askGroups.reduce((total, g) => total + g.unread, 0);
  const close = () => setOpen(false);
  const link = (l: { to: string; label: string; icon: typeof Sun; end?: boolean }, badge = 0) => (
    <NavLink key={l.to} to={l.to} end={l.end} onClick={close} className="nav-link"><l.icon size={20} />{l.label}{badge > 0 && <b className="dot inline">{badge}</b>}</NavLink>);
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Primary">
        <Logo />
        <div className="me"><Avatar name={s.user.name || 'U'} size={52} /><div><strong>{s.user.name}</strong><small className="muted">{s.user.role === 'ADMIN' ? 'Administrator' : `${s.user.accountType ?? 'Student'} · Sem ${s.user.semester}`}</small></div></div>
        <nav>{main.map(l => link(l))}</nav>
        <div className="side-bottom">
          <div className="seg" role="group" aria-label="Theme">{themes.map(t => <button key={t.v} aria-pressed={s.theme === t.v} onClick={e => { const b = e.currentTarget.getBoundingClientRect(); s.setTheme(t.v, { x: b.left + b.width / 2, y: b.top + b.height / 2 }); }}><t.icon size={15} /> {t.label}</button>)}</div>
          <details className="more"><summary className="nav-link"><MessageSquare size={20} />More<ChevronDown size={16} className="chev" />{unread > 0 && <b className="dot inline">{unread}</b>}</summary>
            {more.filter(l => l.to !== '/admin' || s.mode === 'demo' || s.isAdmin).map(l => link(l, l.to === '/notifications' ? unread : l.to === '/messages' ? unreadDirect : l.to === '/seniors' ? unreadGroups : 0))}

          </details>
          {link({ to: '/profile', label: 'Profile', icon: UserIcon })}
          <button className="nav-link" onClick={async () => { await s.signOut(); s.notify(s.mode === 'demo' ? 'Signed out (demo: no real session)' : 'Signed out'); nav('/login'); }}><LogOut size={20} />Logout</button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={close} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu size={22} /></button>
          <form className="search" role="search" onSubmit={e => { e.preventDefault(); nav(`/explore?q=${encodeURIComponent(q)}`); }}>
            <Search size={22} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search topics, subjects..." aria-label="Search topics and subjects" /></form>
          <span className="streak" title={s.mode === 'demo' ? 'Demo streak value' : 'Days in a row on which you completed a study-plan item'}><Flame size={18} />{s.user.streak} day streak</span>
          <Link to="/notifications" className="icon-btn bell" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} title="Notifications"><Bell size={22} />{unread > 0 && <b className="dot bell-dot" aria-hidden="true">{unread}</b>}</Link>
        </header>
        <main className="content">
          <p className="mode" role="note">{s.mode === 'demo' ? 'Demo mode: no server connected. Your data is stored on this device only.' : 'Connected to the StudyPrior API. Your profile, catalog, ratings, planner, notes, drafts, saved items, notifications, and conversations are saved to the server.'}</p>
          {s.loadError ? <Empty title="Couldn't load StudyPrior" hint={s.loadError} action={<button className="btn" onClick={s.reload}>Try again</button>} />
            : s.loading ? <Spinner /> : <div key={loc.pathname} className={(loc.state as { slide?: boolean } | null)?.slide ? 'slide-in' : undefined}><Outlet /></div>}</main>
      </div>
    </div>
  );
}
