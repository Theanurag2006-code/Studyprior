import { describe, expect, it } from 'vitest';
import { academicYear, academicYearLabel, HELPER_MIN_SEMESTER, summarize } from './priority';
import { validateYears } from './validation';

describe('academic profile rules', () => {
  it('derives academic year from semester without deriving account category', () => {
    expect(academicYear(3)).toBe(2);
    expect(academicYearLabel(1)).toBe('First Year');
    expect(academicYearLabel(5)).toBe('Third Year');
    expect(academicYearLabel(8)).toBe('Final Year');
    expect(HELPER_MIN_SEMESTER).toBe(3);
  });
});
describe('summarize', () => {
  const r = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `${i}`, topicId: 't', userId: `${i}`, importance: 5, difficulty: 3, exam: 5, interview: 5, advice: '', mistakes: '', at: '', level: 'Junior' as const }));
  it('returns null for no ratings and flags limited data', () => {
    expect(summarize([])).toBeNull(); expect(summarize(r(2))?.confidence).toBe('Limited data'); expect(summarize(r(6))?.confidence).toBe('Broader community signal');
  });
});
describe('validateYears', () => {
  it('accepts consistent years and rejects inconsistent ones', () => {
    expect(validateYears({ enrollmentYear: 2024, graduationYear: 2028, semester: 3 }, 2026)).toEqual({});
    expect(validateYears({ enrollmentYear: 2024, graduationYear: 2023, semester: 3 }, 2026).graduationYear).toBeTruthy();
    expect(validateYears({ enrollmentYear: 2026, graduationYear: 2030, semester: 7 }, 2026).enrollmentYear).toBeTruthy();
  });
});
