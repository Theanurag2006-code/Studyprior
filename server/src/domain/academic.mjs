export const HELPER_MIN_SEMESTER = 3;
export const DEFAULT_SETTINGS = { maxSemester: 8, helperMinSemester: HELPER_MIN_SEMESTER };
export function validateSettings(s) {
  if (!Number.isInteger(s.maxSemester) || s.maxSemester < 1 || !Number.isInteger(s.helperMinSemester) || s.helperMinSemester < 1 || s.helperMinSemester > s.maxSemester) throw new RangeError('invalid academic settings');
}
export const isValidSemester = (sem, s = DEFAULT_SETTINGS) => Number.isInteger(sem) && sem >= 1 && sem <= s.maxSemester;
/** Legacy compatibility value for the old CHECK-constrained `level` column. Never use this as a category. `account_type` is the user's selected category. */
export const legacyLevelForStorage = () => 'JUNIOR';
export const yearLabel = sem => ['First Year', 'Second Year', 'Third Year', 'Final Year'][Math.min(3, Math.ceil(sem / 2) - 1)] ?? 'Alumni';
