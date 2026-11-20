import type { Level } from './priority';

export interface AcademicSettings { juniorMaxSemester: number; maxSemester: number }
/** Defaults; the live values are stored in the academic_settings table so admins can change them later. */
export const DEFAULT_SETTINGS: AcademicSettings = { juniorMaxSemester: 4, maxSemester: 8 };
export function validateSettings(s: AcademicSettings): void {
  if (!Number.isInteger(s.juniorMaxSemester) || !Number.isInteger(s.maxSemester) || s.juniorMaxSemester < 1 || s.juniorMaxSemester >= s.maxSemester) throw new RangeError('invalid academic settings');
}
export const isValidSemester = (sem: number, s: AcademicSettings = DEFAULT_SETTINGS) => Number.isInteger(sem) && sem >= 1 && sem <= s.maxSemester;
/** The ONLY place that turns a semester into Junior/Senior. Callers never pass or trust a client-supplied level. */
export function deriveAcademicLevel(semester: number, s: AcademicSettings = DEFAULT_SETTINGS): Level {
  validateSettings(s);
  if (!isValidSemester(semester, s)) throw new RangeError(`semester must be an integer from 1 to ${s.maxSemester}`);
  return semester <= s.juniorMaxSemester ? 'JUNIOR' : 'SENIOR';
}
