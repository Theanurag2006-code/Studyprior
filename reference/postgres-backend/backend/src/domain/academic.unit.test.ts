import { describe, expect, it } from 'vitest';
import { deriveAcademicLevel, isValidSemester } from './academic';
import { validateYears } from './years';
import { computeStreak } from './streak';

describe('academic level', () => {
  it('derives Junior for 1-4 and Senior for 5-8', () => { expect([1, 4].map(s => deriveAcademicLevel(s))).toEqual(['JUNIOR', 'JUNIOR']); expect([5, 8].map(s => deriveAcademicLevel(s))).toEqual(['SENIOR', 'SENIOR']); });
  it('rejects invalid semesters', () => { [0, 9, -1, 2.5, NaN].forEach(s => { expect(isValidSemester(s)).toBe(false); expect(() => deriveAcademicLevel(s)).toThrow(); }); });
  it('follows configurable settings instead of hardcoded numbers', () => { expect(deriveAcademicLevel(4, { juniorMaxSemester: 3, maxSemester: 8 })).toBe('SENIOR'); expect(() => deriveAcademicLevel(9, { juniorMaxSemester: 4, maxSemester: 10 })).not.toThrow(); expect(() => deriveAcademicLevel(3, { juniorMaxSemester: 8, maxSemester: 8 })).toThrow(); });
});
describe('year consistency', () => {
  it('accepts consistent input and rejects inconsistent input', () => {
    expect(validateYears({ enrollmentYear: 2024, graduationYear: 2028, currentSemester: 3 }, 2026)).toEqual({});
    expect(validateYears({ enrollmentYear: 2024, graduationYear: 2023, currentSemester: 3 }, 2026).graduationYear).toBeTruthy();
    expect(validateYears({ enrollmentYear: 2026, graduationYear: 2030, currentSemester: 7 }, 2026).currentSemester).toBeTruthy();
    expect(validateYears({ enrollmentYear: 1990, graduationYear: 2030, currentSemester: 1 }, 2026).enrollmentYear).toBeTruthy();
  });
});
describe('streak', () => {
  it('counts consecutive days, allows today to be empty, and is zero without activity', () => {
    expect(computeStreak([], '2026-10-10')).toBe(0);
    expect(computeStreak(['2026-10-10', '2026-10-09', '2026-10-08'], '2026-10-10')).toBe(3);
    expect(computeStreak(['2026-10-09', '2026-10-08'], '2026-10-10')).toBe(2);
    expect(computeStreak(['2026-10-10', '2026-10-08'], '2026-10-10')).toBe(1);
    expect(computeStreak(['2026-10-07'], '2026-10-10')).toBe(0);
  });
});
