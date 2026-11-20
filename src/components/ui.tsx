import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Eye, EyeOff, Star, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';


/** Accessible show/hide control shared by login, registration, reset and change-password forms. */
export function PasswordInput({ value, onChange, autoComplete, disabled = false, placeholder }: { value: string; onChange: (value: string) => void; autoComplete?: string; disabled?: boolean; placeholder?: string }) {
  const [visible, setVisible] = useState(false);
  return <div className="password-wrap">
    <input className="input" type={visible ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)} autoComplete={autoComplete} disabled={disabled} placeholder={placeholder} />
    <button type="button" className="password-toggle" onClick={() => setVisible(v => !v)} disabled={disabled} aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} title={visible ? 'Hide password' : 'Show password'}>
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  </div>;
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => <section className={`card ${className}`}>{children}</section>;
export const Badge = ({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) => <span className={`badge ${tone}`}>{children}</span>;
export const DemoBadge = () => <Badge tone="demo">Demo data</Badge>;
/** Goes back in history when the previous page is in-app; otherwise to a sensible parent route. */
export function BackButton({ fallback, dirty = false, label = 'Back' }: { fallback: string; dirty?: boolean; label?: string }) {
  const nav = useNavigate(); const loc = useLocation();
  const go = () => { if (dirty && !window.confirm('Discard your unsaved changes?')) return; if (loc.key !== 'default') nav(-1); else nav(fallback, { replace: true }); };
  return <button type="button" className="back" onClick={go} aria-label={`${label} (previous page)`}><ArrowLeft size={18} /> {label}</button>;
}
export const PageHeader = ({ title, sub, action, back, dirty }: { title: string; sub?: string; action?: ReactNode; back?: string; dirty?: boolean }) => (
  <>{back && <BackButton fallback={back} dirty={dirty} />}<div className="page-head"><div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>{action}</div></>
);
export const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) => (
  <div className="empty"><strong>{title}</strong>{hint && <p className="muted">{hint}</p>}{action}</div>
);
export const Field = ({ label, error, children }: { label: string; error?: string; children: ReactNode }) => (
  <label className="field"><span>{label}</span>{children}{error && <small className="err" role="alert">{error}</small>}</label>
);
export const Avatar = ({ name, size = 36 }: { name: string; size?: number }) => (
  <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">{(name.trim().split(/\s+/).length > 1 ? name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('') : name.trim().slice(0, 2)).toUpperCase()}</span>
);
export const Spinner = ({ label = 'Loading' }: { label?: string }) => <div className="spinner" role="status" aria-live="polite">{label}…</div>;

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Call the latest close handler without making the focus effect rerun whenever
  // a parent creates a new inline onClose callback during typing/re-rendering.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    ref.current?.focus();
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open]);
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="row between"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close dialog"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

export const LogoMark = ({ size = 44 }: { size?: number }) => (
  <svg className="logo-img" width={size} height={size} viewBox="0 0 1024 1024" role="img" aria-label="StudyPrior logo">
    <rect x="26" y="26" width="972" height="972" rx="190" fill="#f9f8f3" />
    <path d="M207 741h610" stroke="#b5becd" strokeWidth="13" />
    <g fill="none" stroke="#0e1630" strokeWidth="21" strokeLinejoin="round"><rect x="240" y="620" width="85" height="120" rx="14" /><rect x="388" y="525" width="85" height="215" rx="14" /><rect x="535" y="388" width="85" height="352" rx="14" /></g>
    <rect x="683" y="227" width="85" height="514" rx="12" fill="#e8a33c" />
    <path d="M684 160l40 36 68-72" fill="none" stroke="#0e1630" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const Brand = () => <div className="brand-row"><span className="logo"><LogoMark size={44} /></span>StudyPrior</div>;
export function Stars({ label, value, onChange, error }: { label: string; value: number; onChange: (n: number) => void; error?: string }) {
  return (
    <fieldset className="stars-field"><legend>{label}</legend>
      <div className="stars" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map(n => (
          <button type="button" key={n} role="radio" aria-checked={n === value} aria-label={`${n} star${n > 1 ? 's' : ''}`} className={`star ${n <= value ? 'on' : ''}`} onClick={() => onChange(n === value ? 0 : n)}>
            <Star size={34} fill="currentColor" strokeWidth={1.5} />
          </button>))}
      </div>
      {error && <small className="err" role="alert">{error}</small>}
    </fieldset>
  );
}

export const Logo = () => <span className="logo"><span className="logo-mark"><LogoMark size={44} /></span>StudyPrior</span>;
export function StarRating({ label, value, onChange, error }: { label: string; value: number; onChange: (n: number) => void; error?: string }) {
  const id = `rate-${label.replace(/\s/g, '-')}`;
  return (
    <div className="field"><span id={id}>{label}</span>
      <div className="stars" role="radiogroup" aria-labelledby={id}>
        {[1, 2, 3, 4, 5].map(n => (
          <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} of 5`} className={`star ${n <= value ? 'on' : ''}`} onClick={() => onChange(n)}>
            <Star size={34} fill="currentColor" strokeWidth={1.5} /></button>))}
      </div>{error && <small className="err" role="alert">{error}</small>}</div>
  );
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">{items.map((c, i) => (
      <span key={i}>{c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}{i < items.length - 1 && <span aria-hidden="true"> › </span>}</span>))}</nav>
  );
}
