export interface YearInput { enrollmentYear: number; graduationYear: number; currentSemester: number }
/** Consistency checks between enrollment year, graduation year and semester. Returns field -> message. */
export function validateYears({ enrollmentYear: e, graduationYear: g, currentSemester: s }: YearInput, now = new Date().getUTCFullYear()): Record<string, string> {
  const er: Record<string, string> = {};
  if (!Number.isInteger(e) || e < 2000 || e > now + 1) er.enrollmentYear = `enrollmentYear must be between 2000 and ${now + 1}`;
  if (!Number.isInteger(g) || g < 2000 || g > now + 10) er.graduationYear = 'graduationYear is out of range';
  else if (!er.enrollmentYear) {
    if (g - e < 1 || g - e > 8) er.graduationYear = 'graduationYear must be 1 to 8 years after enrollmentYear';
    else if (s > 2 * (g - e)) er.currentSemester = 'currentSemester is beyond the length of the programme';
  }
  if (!er.enrollmentYear && !er.currentSemester && s > 2 * (now - e + 1)) er.currentSemester = 'currentSemester is too advanced for this enrollmentYear';
  return er;
}
