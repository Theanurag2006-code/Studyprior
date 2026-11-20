import { useState } from 'react';
import { useStore } from '../context/Store';
import { BRANCHES } from '../data/mock';
import { Badge, Empty, Modal } from './ui';

/** Flow A: add EXISTING catalog subjects to your personal list. Creating a missing subject is a separate wizard (flow B). */
export function AddSubjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore();
  const [q, setQ] = useState(''); const [branch, setBranch] = useState(s.user.branch); const [sem, setSem] = useState(0); const [picked, setPicked] = useState<string[]>([]); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false);
  const have = new Set(s.mySubjects.map(x => x.id));
  const rows = s.subjects.filter(x => x.branch === branch && (!sem || x.semester === sem) && `${x.name} ${x.code}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string) => { setMsg(''); setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id])); };
  const close = () => { setPicked([]); setMsg(''); onClose(); };
  const add = async () => {
    if (busy || !picked.length) return; setBusy(true); setMsg('');
    try { const r = await s.addSubjects(picked);
      if (r.added) { setPicked([]); s.notify(`${r.added} subject${r.added > 1 ? 's' : ''} added to your list`); close(); } else setMsg('Those subjects are already in your list.');
    } catch { /* Store displays the API error; keep selection for retry. */ } finally { setBusy(false); }
  };
  return (
    <Modal open={open} title="Add subject" onClose={close}>
      <div className="row gap wrap">
        <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Search subjects" aria-label="Search subjects" />
        <select className="input" value={branch} onChange={e => setBranch(e.target.value)} aria-label="Department / branch">{BRANCHES.map(b => <option key={b}>{b}</option>)}</select>
        <select className="input" value={sem} onChange={e => setSem(Number(e.target.value))} aria-label="Semester"><option value={0}>All semesters</option>{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>Semester {n}</option>)}</select>
      </div>
      {rows.length ? rows.map(x => { const added = have.has(x.id); return (
        <label key={x.id} className="row between gap pick"><span className="row gap"><input type="checkbox" disabled={added} checked={added || picked.includes(x.id)} onChange={() => toggle(x.id)} />
          <span><strong>{x.name}</strong> {x.community && <Badge tone="info">Community</Badge>}<small className="muted block">{x.code} · {x.branch} · Sem {x.semester}</small></span></span>
          {added && <Badge tone="ok">Already added</Badge>}</label>); })
        : <Empty title="No catalog subjects match" hint="Try another filter. If the subject is missing from the catalog, use “Add a new subject” on the Share experience page." />}
      {msg && <p role="status" className="err">{msg}</p>}
      <div className="row gap wrap"><button className="btn" disabled={!picked.length || busy} onClick={() => { void add(); }}>Add selected{picked.length ? ` (${picked.length})` : ''}</button><button className="btn outline" onClick={close}>Cancel</button></div>
    </Modal>
  );
}
