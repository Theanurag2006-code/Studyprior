/** CANONICAL priority + confidence rules (same as the frontend's src/lib/priority.ts). Difficulty and confidence never change the score. */
export const WEIGHTS = { importance: 4 / 9, exam: 1 / 3, interview: 2 / 9 };
const norm = v => (v - 1) / 4;
const ok = v => Number.isInteger(v) && v >= 1 && v <= 5;
export function priorityScore(r) { if (!(r.importance >= 1 && r.importance <= 5 && r.exam >= 1 && r.exam <= 5 && r.interview >= 1 && r.interview <= 5)) throw new RangeError('ratings must be between 1 and 5'); return Math.round(100 * (WEIGHTS.importance * norm(r.importance) + WEIGHTS.exam * norm(r.exam) + WEIGHTS.interview * norm(r.interview))); }
export const priorityLabel = s => (s >= 85 ? 'Must Study' : s >= 70 ? 'High Priority' : s >= 50 ? 'Medium' : 'Low');
export const confidenceLabel = n => (n <= 0 ? 'No ratings yet' : n < 3 ? 'Limited data' : n < 6 ? 'Early signal' : 'Broader community signal');
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length; const r2 = n => Math.round(n * 100) / 100;
export function summarize(ratings, emptyMessage = 'No ratings yet') {
  for (const r of ratings) if (![r.importance, r.difficulty, r.exam, r.interview].every(ok)) throw new RangeError('ratings must be integers from 1 to 5');
  const n = ratings.length; if (!n) return { sampleCount: 0, priorityScore: null, priorityLabel: null, confidence: { label: 'No ratings yet', sampleCount: 0 }, means: null, message: emptyMessage };
  const m = { importance: mean(ratings.map(r => r.importance)), difficulty: mean(ratings.map(r => r.difficulty)), exam: mean(ratings.map(r => r.exam)), interview: mean(ratings.map(r => r.interview)) }; const score = priorityScore(m);
  return { sampleCount: n, priorityScore: score, priorityLabel: priorityLabel(score), confidence: { label: confidenceLabel(n), sampleCount: n }, means: { importance: r2(m.importance), difficulty: r2(m.difficulty), exam: r2(m.exam), interview: r2(m.interview) }, message: null };
}
export const summarizeTopic = rows => ({ overall: summarize(rows), senior: summarize(rows.filter(r => r.level === 'SENIOR'), 'No senior ratings yet.'), junior: summarize(rows.filter(r => r.level === 'JUNIOR'), 'No junior ratings yet.'), candidate: summarize(rows.filter(r => r.level === 'CANDIDATE'), 'No candidate ratings yet.') });
