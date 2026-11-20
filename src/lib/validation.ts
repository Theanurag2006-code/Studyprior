export interface YearInput { enrollmentYear: number; graduationYear: number; semester: number }
export const MIN_YEAR = 2000;
/** Client-side UX checks only. The backend must repeat these. */
export function validateYears({ enrollmentYear: e, graduationYear: g, semester: s }: YearInput, now = new Date().getFullYear()): Record<string, string> {
  const er: Record<string, string> = {};
  if (!Number.isInteger(e) || e < MIN_YEAR || e > now + 1) er.enrollmentYear = `Enter a year between ${MIN_YEAR} and ${now + 1}`;
  if (!Number.isInteger(g) || g < MIN_YEAR || g > now + 10) er.graduationYear = 'Enter a valid graduation year';
  else if (!er.enrollmentYear) {
    if (g - e < 1 || g - e > 8) er.graduationYear = 'Graduation must be 1 to 8 years after enrollment';
    else if (s > 2 * (g - e)) er.graduationYear = 'Too early for your current semester';
  }
  if (!er.enrollmentYear && s > 2 * (now - e + 1)) er.enrollmentYear = 'Semester is too advanced for this enrollment year';
  return er;
}
