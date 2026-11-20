/**
 * CANONICAL priority + confidence rules. This is the single source of truth.
 * The frontend must display what the API returns and must not re-implement this.
 *
 * Only importance, exam relevance and interview relevance affect the score (original weights 40:30:20,
 * normalised to sum to 100%). Difficulty is reported but never enters the score. Confidence is a separate
 * sample-size label and never enters the score.
 */
export interface RatingValues { importance: number; difficulty: number; examRelevance: number; interviewRelevance: number }
export type PriorityLabel = 'Must Study' | 'High Priority' | 'Medium' | 'Low';
export type ConfidenceLabel = 'No ratings yet' | 'Limited data' | 'Early signal' | 'Broader community signal';
export type Level = 'JUNIOR' | 'SENIOR';

export const WEIGHTS = { importance: 4 / 9, exam: 1 / 3, interview: 2 / 9 } as const;
const norm = (v: number) => (v - 1) / 4;
export function assertRating(v: number, name: string): void {
  if (!Number.isInteger(v) || v < 1 || v > 5) throw new RangeError(`${name} must be an integer from 1 to 5`);
}
type ScoreInput = Pick<RatingValues, 'importance' | 'examRelevance' | 'interviewRelevance'>;
/** priority_score = ROUND(100 * (4/9 * importance_norm + 1/3 * exam_norm + 2/9 * interview_norm)) */
export function priorityScore(r: ScoreInput): number {
  if (!(r.importance >= 1 && r.importance <= 5 && r.examRelevance >= 1 && r.examRelevance <= 5 && r.interviewRelevance >= 1 && r.interviewRelevance <= 5)) throw new RangeError('ratings must be between 1 and 5');
  return Math.round(100 * (WEIGHTS.importance * norm(r.importance) + WEIGHTS.exam * norm(r.examRelevance) + WEIGHTS.interview * norm(r.interviewRelevance)));
}
export const priorityLabel = (score: number): PriorityLabel => (score >= 85 ? 'Must Study' : score >= 70 ? 'High Priority' : score >= 50 ? 'Medium' : 'Low');
export const confidenceLabel = (n: number): ConfidenceLabel => (n <= 0 ? 'No ratings yet' : n < 3 ? 'Limited data' : n < 6 ? 'Early signal' : 'Broader community signal');

export interface Breakdown {
  sampleCount: number;
  priorityScore: number | null; // null (never 0) when there are no ratings
  priorityLabel: PriorityLabel | null;
  confidence: { label: ConfidenceLabel; sampleCount: number };
  means: RatingValues | null;
  message: string | null; // human text for the empty case
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const r2 = (n: number) => Math.round(n * 100) / 100;
/** Aggregate ratings: score is computed from the MEAN of each dimension (one rounding step at the end). */
export function summarize(ratings: RatingValues[], emptyMessage = 'No ratings yet'): Breakdown {
  ratings.forEach(r => { assertRating(r.importance, 'importance'); assertRating(r.difficulty, 'difficulty'); assertRating(r.examRelevance, 'examRelevance'); assertRating(r.interviewRelevance, 'interviewRelevance'); });
  const n = ratings.length;
  if (!n) return { sampleCount: 0, priorityScore: null, priorityLabel: null, confidence: { label: 'No ratings yet', sampleCount: 0 }, means: null, message: emptyMessage };
  const means = { importance: mean(ratings.map(r => r.importance)), difficulty: mean(ratings.map(r => r.difficulty)), examRelevance: mean(ratings.map(r => r.examRelevance)), interviewRelevance: mean(ratings.map(r => r.interviewRelevance)) };
  const score = priorityScore(means);
  return { sampleCount: n, priorityScore: score, priorityLabel: priorityLabel(score), confidence: { label: confidenceLabel(n), sampleCount: n },
    means: { importance: r2(means.importance), difficulty: r2(means.difficulty), examRelevance: r2(means.examRelevance), interviewRelevance: r2(means.interviewRelevance) }, message: null };
}
/** `level` is the contributor's academic level SNAPSHOT at submission time, never their current level. */
export function summarizeTopic(rows: (RatingValues & { level: Level })[]) {
  return {
    overall: summarize(rows),
    senior: summarize(rows.filter(r => r.level === 'SENIOR'), 'No senior ratings yet.'),
    junior: summarize(rows.filter(r => r.level === 'JUNIOR'), 'No junior ratings yet.'),
  };
}
