import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil } from 'lucide-react';
import { useStore } from '../context/Store';
import { BRANCHES, DEPARTMENTS } from '../data/mock';
import { academicYear } from '../lib/priority';
import { validateYears } from '../lib/validation';
import { Avatar, BackButton, Badge, Card, Field, PasswordInput } from '../components/ui';

const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'} Semester`;
const ro = (label: string, value: string) => <Field label={label}><input className="input ro" value={value} readOnly aria-readonly="true" /></Field>;

/** View Profile: read-only summary using the same layout as the edit form. */
export default function Profile() {
  const s = useStore(); const u = s.user; const admin = u.role === 'ADMIN';
  return (
    <div className="narrow">
      <BackButton fallback="/" />
      <div className="page-head"><div><h1>Profile</h1><p className="muted">Your account and academic details.</p></div><Link className="btn" to="/profile/edit"><Pencil size={16} /> Edit profile</Link></div>
      <Card className="pad"><div className="row gap id-row"><Avatar name={u.name || 'U'} size={96} /><div><h3 className="id-name">{u.name}</h3><p className="muted">{u.email}</p><p className="muted small">Joined {u.joined}</p></div></div>
        <div className="grid2 tight">
          {ro('Display name', u.name)}{ro('Email', u.email)}{ro('Role', admin ? 'Administrator' : 'Student')}{!admin && ro('Account category', u.accountType ?? 'Needs confirmation')}{ro('Branch / specialization', u.branch || '—')}
          {!admin && ro('Semester', ord(u.semester))}{ro('College / University', u.college)}{ro('Department', u.department || '—')}{!admin && ro('Current academic year (derived)', `Year ${academicYear(u.semester)}`)}
          {!admin && ro('Enrollment year', String(u.enrollmentYear))}{!admin && ro('Expected graduation year', String(u.graduationYear))}
        </div>
        <Field label="Bio"><textarea className="input ro" rows={3} value={u.bio || '—'} readOnly aria-readonly="true" /></Field>
        <p className="muted">{u.semester < 3 ? 'Connect & Ask helper availability starts from semester 3.' : u.available ? 'Available to help students through Connect & Ask.' : 'Not currently available to help other students.'}</p>
        <p className="muted small">Your account category is selected independently from your semester.</p>
      </Card>
    </div>
  );
}

/** Edit Profile: the existing form, now saving through the API layer with loading and honest error states. */
export function ProfileEdit() {
  const s = useStore(); const nav = useNavigate(); const u = s.user; const admin = u.role === 'ADMIN';
  const init = () => ({ name: u.name, college: u.college, branch: u.branch, department: u.department, enrollmentYear: String(u.enrollmentYear), graduationYear: String(u.graduationYear), bio: u.bio, available: u.available, publicProfile: u.publicProfile ?? true, accountType: (u.accountType ?? 'Junior') as 'Junior' | 'Senior' | 'Candidate' });
  const [base] = useState(init); const [f, setF] = useState(init); const [err, setErr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState('');
  const dirty = JSON.stringify(f) !== JSON.stringify(base);
  const up = (k: string, v: string | boolean) => { setF(p => ({ ...p, [k]: v })); setFail(''); };
  const save = async (e: FormEvent) => {
    e.preventDefault(); const er: Record<string, string> = {};
    if (f.name.trim().length < 2) er.name = 'Enter a display name (at least 2 characters)'; if (!f.college.trim()) er.college = 'Enter your college or university'; if (f.bio.length > 300) er.bio = 'Max 300 characters';
    if (!f.department) er.department = 'Select a department';
    if (!admin) Object.assign(er, validateYears({ enrollmentYear: Number(f.enrollmentYear), graduationYear: Number(f.graduationYear), semester: u.semester }));
    setErr(er); setFail(''); if (Object.keys(er).length) return;
    setBusy(true);
    try {
      await s.saveProfile({ name: f.name.trim(), department: f.department, branch: f.branch, college: f.college.trim(), ...(admin ? {} : { enrollmentYear: Number(f.enrollmentYear), graduationYear: Number(f.graduationYear) }), bio: f.bio.trim(), ...(u.semester >= 3 && !admin ? { available: f.available, publicProfile: f.publicProfile } : {}), ...(!u.accountTypeSelected && !admin ? { accountType: f.accountType } : {}) });
      s.notify(`Profile saved${s.mode === 'demo' ? ' (demo: stored on this device only)' : ''}`); nav('/profile', { replace: true });
    } catch (x) { setFail(x instanceof Error ? x.message : 'Could not save your profile.'); } finally { setBusy(false); }
  };
  const cancel = () => { if (dirty && !window.confirm('Discard your changes?')) return; nav('/profile'); };
  return (
    <div className="narrow">
      <BackButton fallback="/profile" dirty={dirty} />
      <div className="page-head"><div><h1>Edit profile</h1><p className="muted">Update your personal and academic details.</p></div></div>
      <Card className="pad"><div className="row gap id-row"><Avatar name={f.name || 'U'} size={96} /><div><h3 className="id-name">{f.name || u.name}</h3><p className="muted">{u.email}</p><p className="muted small">Joined {u.joined}</p></div></div>
        <form className="form" onSubmit={save} noValidate>
          <div className="grid2 tight">
            <Field label="Display name" error={err.name}><input className="input" value={f.name} onChange={e => up('name', e.target.value)} autoComplete="name" /></Field>
            {ro('Email (read-only)', u.email)}{ro('Role', admin ? 'Administrator' : 'Student')}
            <Field label="Branch / specialization"><select className="input" value={f.branch} onChange={e => up('branch', e.target.value)}>{BRANCHES.map(b => <option key={b}>{b}</option>)}</select></Field>
            {!admin && ro('Semester (set by StudyPrior)', ord(u.semester))}
            <Field label="College / University" error={err.college}><input className="input" value={f.college} onChange={e => up('college', e.target.value)} /></Field>
            <Field label="Department" error={err.department}><select className="input" value={f.department} onChange={e => up('department', e.target.value)}><option value="">Select department</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></Field>
            {!admin && ro('Current academic year (derived)', `Year ${academicYear(u.semester)}`)}
            {!admin && <Field label="Enrollment year" error={err.enrollmentYear}><input className="input" inputMode="numeric" value={f.enrollmentYear} onChange={e => up('enrollmentYear', e.target.value)} /></Field>}
            {!admin && <Field label="Expected graduation year" error={err.graduationYear}><input className="input" inputMode="numeric" value={f.graduationYear} onChange={e => up('graduationYear', e.target.value)} /></Field>}
          </div>
          {!admin && !u.accountTypeSelected ? <Field label="Confirm your account category"><select className="input" value={f.accountType} onChange={e => up('accountType', e.target.value)}><option value="Junior">Junior</option><option value="Senior">Senior</option><option value="Candidate">Candidate</option></select><small className="muted">This one-time confirmation is available because your account was created before independent account categories were introduced.</small></Field> : !admin ? ro('Account category', u.accountType ?? '—') : null}
          <p className="muted small">Account category and semester are independent. Your account category is fixed once confirmed; semester is managed separately.</p>
          <Field label="Bio" error={err.bio}><textarea className="input" rows={3} value={f.bio} onChange={e => up('bio', e.target.value)} /></Field>
          {!admin && u.semester >= 3 ? <><label className="row gap check"><input type="checkbox" checked={f.available} onChange={e => up('available', e.target.checked)} /> Available to help other students (Connect & Ask)</label>
            <label className="row gap check"><input type="checkbox" checked={f.publicProfile} onChange={e => up('publicProfile', e.target.checked)} /> Show my profile in Connect & Ask and public contributor lists</label>
            <p className="muted small">Semester 3 or above students can opt in, regardless of account category. Turning availability off removes you from helper discovery; existing private conversations remain in your account.</p></> : !admin ? <p className="muted small">Helper availability is available starting in semester 3.</p> : null}
          {fail && <p className="err" role="alert">Not saved: {fail} Your changes are still here, so you can try again.</p>}
          <div className="row gap wrap"><button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button><button className="btn outline" type="button" onClick={cancel} disabled={busy}>Cancel</button></div>
        </form></Card>
      <PasswordCard />
    </div>
  );
}

/** Real password change when a server is configured (it signs out your other devices); disabled in demo mode. */
function PasswordCard() {
  const s = useStore(); const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState(''); const [er, setEr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState(''); const demo = s.mode === 'demo';
  const submit = async (e: FormEvent) => {
    e.preventDefault(); const x: Record<string, string> = {}; if (!cur) x.cur = 'Enter your current password'; if (next.length < 10) x.next = 'Use at least 10 characters'; if (confirm !== next) x.confirm = 'Passwords do not match'; setEr(x); setFail(''); if (Object.keys(x).length) return;
    setBusy(true); try { await s.changePassword(cur, next); setCur(''); setNext(''); setConfirm(''); s.notify('Password changed. Your other devices were signed out.'); } catch (y) { setFail(y instanceof Error ? y.message : 'Could not change the password.'); } finally { setBusy(false); }
  };
  return (
    <Card className="pad"><h3>Change password {demo && <Badge tone="demo">Needs a server</Badge>}</h3>
      <form className="form" onSubmit={submit} noValidate><div className="grid2 tight">
        <Field label="Current password" error={er.cur}><PasswordInput value={cur} disabled={demo} onChange={setCur} autoComplete="current-password" /></Field>
        <Field label="New password" error={er.next}><PasswordInput value={next} disabled={demo} onChange={setNext} autoComplete="new-password" /></Field>
        <Field label="Confirm new password" error={er.confirm}><PasswordInput value={confirm} disabled={demo} onChange={setConfirm} autoComplete="new-password" /></Field></div>
        {fail && <p className="err" role="alert">Not changed: {fail}</p>}
        <button className="btn" type="submit" disabled={demo || busy} title={demo ? 'Password changes need a server (not available in demo mode)' : undefined}>{busy ? 'Updating…' : 'Update password'}</button></form></Card>
  );
}
