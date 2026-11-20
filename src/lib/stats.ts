import type { Rating } from '../types';
import { MIN_RATINGS, summarize } from './priority';

export type Dim = 'importance' | 'difficulty' | 'exam' | 'interview';
export const DIMS: { key: Dim; label: string; tip: string }[] = [
  { key: 'importance', label: 'Importance', tip: 'How important students say this topic is to study.' },
  { key: 'difficulty', label: 'Difficulty', tip: 'How hard students found it. Not part of the priority score ranking weight beyond 10%.' },
  { key: 'exam', label: 'Exam relevance', tip: 'How likely it is to matter in exams.' },
  { key: 'interview', label: 'Interview relevance', tip: 'How likely it is to matter in interviews.' },
];
/** Largest-remainder rounding: whole-number percentages that add up to exactly 100 (all zeros when there are no votes). */
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0); if (!total) return counts.map(() => 0);
  const raw = counts.map(c => (c * 100) / total); const out = raw.map(Math.floor); const rem = 100 - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i).slice(0, rem).forEach(x => { out[x.i]++; });
  return out;
}
export interface Dist { dim: Dim; votes: number; mean: number | null; counts: number[]; percents: number[] } // counts[0] = 1-star ... counts[4] = 5-star
export function distribution(rs: Rating[], dim: Dim): Dist {
  const counts = [0, 0, 0, 0, 0];
  rs.forEach(r => { const v = r[dim]; if (Number.isInteger(v) && v >= 1 && v <= 5) counts[v - 1]++; });
  const votes = counts.reduce((a, b) => a + b, 0);
  return { dim, votes, mean: votes ? counts.reduce((a, c, i) => a + c * (i + 1), 0) / votes : null, counts, percents: percentages(counts) };
}
export const clean = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim();
export interface ContribStats { votes: number; feedback: number; distinctDescriptions: number; mistakes: number; contributors: number }
/** votes = rating records; feedback = ratings with non-empty advice; distinct = unique advice texts (case-insensitive); contributors = distinct users. */
export function contribStats(rs: Rating[]): ContribStats {
  const adv = rs.map(r => clean(r.advice)).filter(Boolean);
  return { votes: rs.length, feedback: adv.length, distinctDescriptions: new Set(adv.map(a => a.toLowerCase())).size, mistakes: rs.filter(r => clean(r.mistakes)).length, contributors: new Set(rs.map(r => r.userId)).size };
}
export interface SubjectStats extends ContribStats { units: number; topics: number; withConsensus: number; limited: number; unrated: number; levels: Record<string, number> }
/** Aggregates across the subject's topics (the product has no subject-level rating). Contributors are distinct users across all topics. */
export function subjectStats(topicIds: string[], unitCount: number, ratings: Rating[]): SubjectStats {
  const set = new Set(topicIds); const rs = ratings.filter(r => set.has(r.topicId));
  const levels: Record<string, number> = { 'Must Study': 0, 'High Priority': 0, Medium: 0, Low: 0 }; let withConsensus = 0, limited = 0, unrated = 0;
  topicIds.forEach(id => { const s = summarize(rs.filter(r => r.topicId === id)); if (!s) unrated++; else if (s.n < MIN_RATINGS) limited++; else { withConsensus++; levels[s.level]++; } });
  return { ...contribStats(rs), units: unitCount, topics: topicIds.length, withConsensus, limited, unrated, levels };
}
const STOP = new Set('this that with from your have they them then than into when what will make just more most some such only also very much many before after about their there which would should could first'.split(' '));
/** Words used by at least two different contributors in their written advice. Community themes, not official facts. */
export function themes(rs: Rating[]): { word: string; users: number }[] {
  const by = new Map<string, Set<string>>();
  rs.forEach(r => new Set(clean(r.advice).toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 5 && !STOP.has(w))).forEach(w => { (by.get(w) ?? by.set(w, new Set()).get(w)!).add(r.userId); }));
  return [...by.entries()].map(([word, u]) => ({ word, users: u.size })).filter(x => x.users >= 2).sort((a, b) => b.users - a.users || a.word.localeCompare(b.word)).slice(0, 6);
}
