import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../context/Store';
import { BRANCHES, DEPARTMENTS } from '../data/mock';
import { academicYear } from '../lib/priority';
import { validateYears } from '../lib/validation';
import { Brand, Card, Field, PasswordInput } from '../components/ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function Layout({ title, children }: { title: string; children: ReactNode }) {
  const s = useStore();
  return <div className="auth"><Brand /><p className="muted">Study Smart, Not Hard.</p>
    <Card><h1>{title}</h1>{s.mode === 'demo' && <p className="note">Demo only: no real authentication or email is implemented in demo mode.</p>}{children}</Card></div>;
}
const msg = (x: unknown) => (x instanceof Error ? x.message : 'Something went wrong. Please try again.');
export function Login() {
  const s = useStore(); const nav = useNavigate(); const [e, setE] = useState(''); const [p, setP] = useState(''); const [er, setEr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState('');
  useEffect(() => { if (s.mode === 'api' && s.authStatus === 'signedIn') nav('/', { replace: true }); }, [s.mode, s.authStatus, nav]);
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); const x: Record<string, string> = {}; if (!EMAIL.test(e)) x.e = 'Enter a valid email'; if (!p) x.p = 'Enter your password'; setEr(x); setFail(''); if (Object.keys(x).length) return;
    if (s.mode === 'demo') { s.notify('Entered demo mode (no real sign-in)'); nav('/'); return; }
    setBusy(true); try { await s.signIn(e.trim(), p); nav('/', { replace: true }); } catch (x2) { setFail(msg(x2)); } finally { setBusy(false); }
  };
  return <Layout title="Log in"><form className="form" noValidate onSubmit={submit}>
    <Field label="Email" error={er.e}><input className="input" type="email" value={e} onChange={ev => setE(ev.target.value)} autoComplete="email" /></Field>
    <Field label="Password" error={er.p}><PasswordInput value={p} onChange={setP} autoComplete="current-password" /></Field>
    {fail && <p className="err" role="alert">{fail}</p>}
    <button className="btn" type="submit" disabled={busy}>{busy ? 'Signing in…' : s.mode === 'demo' ? 'Continue to demo' : 'Log in'}</button>
    <p><Link to="/forgot">Forgot password?</Link> · <Link to="/register">Create account</Link></p></form></Layout>;
}
export function Register() {
  const s = useStore(); const nav = useNavigate(); const minPw = s.mode === 'api' ? 10 : 8;
  const [f, setF] = useState({ name: '', email: '', college: '', department: '', branch: BRANCHES[0], enrollment: '', enrollmentYear: '', graduationYear: '', semester: 1, accountType: 'JUNIOR', password: '', confirm: '' }); const [er, setEr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState('');
  const up = (k: string, v: string | number) => setF(p => ({ ...p, [k]: v }));
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); const x: Record<string, string> = {};
    if (f.name.trim().length < 2) x.name = 'Enter your name'; if (!EMAIL.test(f.email)) x.email = 'Enter a valid email'; if (!f.college.trim()) x.college = 'Enter your college'; if (!f.department) x.department = 'Select a department';
    Object.assign(x, validateYears({ enrollmentYear: Number(f.enrollmentYear), graduationYear: Number(f.graduationYear), semester: f.semester }));
    if (f.password.length < minPw) x.password = `Use at least ${minPw} characters`; if (f.confirm !== f.password) x.confirm = 'Passwords do not match'; setEr(x); setFail(''); if (Object.keys(x).length) return;
    if (s.mode === 'demo') { s.notify('Registration is demo only: no account was created'); nav('/login'); return; }
    setBusy(true);
    try { await s.signUp({ name: f.name.trim(), email: f.email.trim(), password: f.password, department: f.department, branch: f.branch, college: f.college.trim(), ...(f.enrollment.trim() ? { enrollmentNumber: f.enrollment.trim() } : {}), enrollmentYear: Number(f.enrollmentYear), graduationYear: Number(f.graduationYear), currentSemester: f.semester, accountType: f.accountType as 'JUNIOR' | 'SENIOR' | 'CANDIDATE' }); nav('/', { replace: true }); }
    catch (x2) { setFail(msg(x2)); } finally { setBusy(false); }
  };
  return <Layout title="Create account"><form className="form" noValidate onSubmit={submit}>
    <Field label="Full name" error={er.name}><input className="input" value={f.name} onChange={e => up('name', e.target.value)} /></Field>
    <Field label="Email" error={er.email}><input className="input" type="email" value={f.email} onChange={e => up('email', e.target.value)} /></Field>
    <Field label="College / University" error={er.college}><input className="input" value={f.college} onChange={e => up('college', e.target.value)} /></Field>
    <Field label="Department" error={er.department}><select className="input" value={f.department} onChange={e => up('department', e.target.value)}><option value="">Select department</option>{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></Field>
    <Field label="Branch / specialization"><select className="input" value={f.branch} onChange={e => up('branch', e.target.value)}>{BRANCHES.map(b => <option key={b}>{b}</option>)}</select></Field>
    <Field label="Enrollment number (optional)"><input className="input" value={f.enrollment} onChange={e => up('enrollment', e.target.value)} /></Field>
    <div className="grid2 tight"><Field label="Enrollment year" error={er.enrollmentYear}><input className="input" inputMode="numeric" value={f.enrollmentYear} onChange={e => up('enrollmentYear', e.target.value)} /></Field>
      <Field label="Expected graduation year" error={er.graduationYear}><input className="input" inputMode="numeric" value={f.graduationYear} onChange={e => up('graduationYear', e.target.value)} /></Field></div>
    <div className="grid2 tight"><Field label="Account category"><select className="input" value={f.accountType} onChange={e => up('accountType', e.target.value)}><option value="JUNIOR">Junior</option><option value="SENIOR">Senior</option><option value="CANDIDATE">Candidate</option></select></Field>
      <Field label="Current semester"><select className="input" value={f.semester} onChange={e => up('semester', Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>{n}</option>)}</select></Field></div>
    <p className="muted small">Choose your account category independently from your semester. Semester {f.semester} is Year {academicYear(f.semester)} and does not change your selected category.</p>
    <Field label="Password" error={er.password}><PasswordInput value={f.password} onChange={value => up('password', value)} autoComplete="new-password" /></Field>
    <Field label="Confirm password" error={er.confirm}><PasswordInput value={f.confirm} onChange={value => up('confirm', value)} autoComplete="new-password" /></Field>
    {fail && <p className="err" role="alert">{fail}</p>}
    <button className="btn" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button><p><Link to="/login">Back to log in</Link></p></form></Layout>;
}
export function Forgot() {
  const s = useStore(); const [e, setE] = useState(''); const [er, setEr] = useState(''); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false); const [fail, setFail] = useState('');
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); if (!EMAIL.test(e)) { setEr('Enter a valid email'); return; } setEr(''); setFail('');
    if (s.mode === 'demo') { setDone(true); return; }
    setBusy(true); try { await s.forgotPassword(e.trim()); setDone(true); } catch (x) { setFail(msg(x)); } finally { setBusy(false); }
  };
  return <Layout title="Reset password">{done ? <p role="status">{s.mode === 'demo' ? 'Demo only: no email was sent.' : 'If an account exists for that email, a reset link is on its way. While developing locally with no email service, the link is printed in the server window.'}</p> :
    <form className="form" noValidate onSubmit={submit}>
      <Field label="Email" error={er}><input className="input" type="email" value={e} onChange={ev => setE(ev.target.value)} /></Field>{fail && <p className="err" role="alert">{fail}</p>}<button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button></form>}
    <p><Link to="/login">Back to log in</Link></p></Layout>;
}
export function ResetPassword() {
  const s = useStore(); const nav = useNavigate(); const [sp] = useSearchParams(); const token = sp.get('token') ?? ''; const [pw, setPw] = useState(''); const [c, setC] = useState(''); const [er, setEr] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [fail, setFail] = useState('');
  const submit = async (ev: FormEvent) => {
    ev.preventDefault(); const x: Record<string, string> = {}; if (pw.length < 10) x.pw = 'Use at least 10 characters'; if (c !== pw) x.c = 'Passwords do not match'; setEr(x); setFail(''); if (Object.keys(x).length) return;
    setBusy(true); try { await s.resetPassword(token, pw); s.notify('Password updated. Please sign in.'); nav('/login', { replace: true }); } catch (x2) { setFail(msg(x2)); } finally { setBusy(false); }
  };
  return <Layout title="Choose a new password">{!token || s.mode === 'demo' ? <p role="alert">This reset link is missing its token. Request a new link from the Forgot password page.</p> :
    <form className="form" noValidate onSubmit={submit}>
      <Field label="New password" error={er.pw}><PasswordInput value={pw} onChange={setPw} autoComplete="new-password" /></Field>
      <Field label="Confirm new password" error={er.c}><PasswordInput value={c} onChange={setC} autoComplete="new-password" /></Field>
      {fail && <p className="err" role="alert">{fail}</p>}<button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set new password'}</button></form>}
    <p><Link to="/forgot">Request a new link</Link> · <Link to="/login">Back to log in</Link></p></Layout>;
}
