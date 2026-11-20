import { PURPOSES } from '../lib/purposes';
import type { PurposeCode } from '../types';
import { Field } from './ui';

export function PurposeField({ code, custom, error, onChange }: { code: string; custom: string; error?: string; onChange: (code: PurposeCode | '', custom: string) => void }) {
  return (
    <>
      <Field label="Study purpose (optional)"><select className="input" value={code} onChange={e => onChange(e.target.value as PurposeCode | '', custom)}>
        <option value="">No purpose</option>{PURPOSES.map(p => <option key={p.code} value={p.code}>{p.label}</option>)}</select></Field>
      {code === 'OTHER' && <Field label="Your purpose" error={error}><input className="input" value={custom} maxLength={60} onChange={e => onChange('OTHER', e.target.value)} placeholder="e.g. Prepare for a hackathon" /></Field>}
    </>
  );
}
