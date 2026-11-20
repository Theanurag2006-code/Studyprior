import type { Confidence, Level, Rating, Summary } from '../types';

/** Assumed formula and thresholds: tune once the product spec defines them. The backend must own this later. */
export const MIN_RATINGS = 3;
export const HELPER_MIN_SEMESTER = 3;
/** Academic year is derived from semester; account category is selected independently at sign-up. */
export const SEMESTER_YEARS = [
  { from: 1, to: 2, label: 'First Year' }, { from: 3, to: 4, label: 'Second Year' },
  { from: 5, to: 6, label: 'Third Year' }, { from: 7, to: 8, label: 'Final Year' },
];
export const academicYear = (sem: number) => Math.ceil(sem / 2);
export const academicYearLabel = (sem: number) => SEMESTER_YEARS.find(y => sem >= y.from && sem <= y.to)?.label ?? 'Alumni';

type Key = 'importance' | 'difficulty' | 'exam' | 'interview';
const avg = (rs: Rating[], k: Key) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
export function summarize(rs: Rating[]): Summary | null {
  if (!rs.length) return null;
  const importance = avg(rs, 'importance'), difficulty = avg(rs, 'difficulty'), exam = avg(rs, 'exam'), interview = avg(rs, 'interview');
  // Canonical rule (see backend/src/domain/priority.ts): importance:exam:interview = 4/9:1/3:2/9 of the 0-1 normalised values; difficulty is NOT part of the score.
  const score = Math.round(100 * ((4 / 9) * ((importance - 1) / 4) + (1 / 3) * ((exam - 1) / 4) + (2 / 9) * ((interview - 1) / 4)));
  const level: Level = score >= 85 ? 'Must Study' : score >= 70 ? 'High Priority' : score >= 50 ? 'Medium' : 'Low';
  const n = rs.length;
  const confidence: Confidence = n < MIN_RATINGS ? 'Limited data' : n < 6 ? 'Early signal' : 'Broader community signal';
  return { n, importance, difficulty, exam, interview, score, level, confidence };
}
export const LEVELS: Level[] = ['Must Study', 'High Priority', 'Medium', 'Low'];
export const levelTone = (l: Level) => (l === 'Must Study' ? 'ok' : l === 'High Priority' ? 'info' : l === 'Medium' ? 'warn' : 'neutral');
export const todayISO = () => new Date().toISOString().slice(0, 10);
