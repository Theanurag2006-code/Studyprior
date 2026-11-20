import type { DraftTopic, NewSubjectInput } from '../types';
import { squash } from './purposes';

const key = (s: string) => squash(s.toLowerCase().replace(/[^a-z0-9 ]/g, ' '));
const tokens = (k: string) => new Set(k.split(' ').filter(Boolean).map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)));
/** Likely-duplicate check: same name, one contains the other, or most words shared. */
export function findSimilar<T extends { name: string }>(name: string, subjects: T[]): T[] {
  const k = key(name); if (k.length < 3) return [];
  const kt = tokens(k);
  return subjects.filter(s => {
    const o = key(s.name); if (o === k) return true;
    if (k.length >= 4 && (o.includes(k) || k.includes(o))) return true;
    const ot = tokens(o); let inter = 0; kt.forEach(t => { if (ot.has(t)) inter++; });
    return inter / (kt.size + ot.size - inter) >= 0.6;
  });
}
export interface DraftFields { name: string; branch: string; semester: number; description: string; topics: DraftTopic[] }
export function validateDraft(d: DraftFields): Record<string, string> {
  const er: Record<string, string> = {}; const n = squash(d.name);
  if (n.length < 3 || n.length > 80) er.name = 'Subject name must be 3 to 80 characters';
  if (!d.branch) er.branch = 'Select a department / branch';
  if (!Number.isInteger(d.semester) || d.semester < 1 || d.semester > 8) er.semester = 'Choose a semester from 1 to 8';
  if (d.description.length > 500) er.description = 'Keep the description under 500 characters';
  const named = d.topics.filter(t => squash(t.name));
  if (!named.length) er.topics = 'Add at least one topic';
  const seen = new Set<string>();
  d.topics.forEach((t, i) => {
    const tn = squash(t.name); if (!tn && !squash(t.unit) && !t.description && !t.hours) return;
    if (tn.length < 2 || tn.length > 80) er[`topic-${i}`] = 'Topic name must be 2 to 80 characters';
    else if (seen.has(tn.toLowerCase())) er[`topic-${i}`] = 'Duplicate topic in this subject'; else seen.add(tn.toLowerCase());
    if (t.hours && !(Number(t.hours) >= 0.5 && Number(t.hours) <= 200)) er[`hours-${i}`] = 'Hours must be 0.5 to 200';
  });
  return er;
}
export const toInput = (d: DraftFields): NewSubjectInput => ({
  name: squash(d.name), branch: d.branch, semester: d.semester, description: d.description.trim(),
  topics: d.topics.filter(t => squash(t.name)).map(t => ({ name: squash(t.name), unit: squash(t.unit) || 'General', description: t.description.trim(), ...(t.hours ? { hours: Number(t.hours) } : {}) })),
});
