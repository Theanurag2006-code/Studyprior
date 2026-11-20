import { describe, expect, it } from 'vitest';
import { confidenceLabel, priorityLabel, priorityScore, summarize, summarizeTopic } from './priority';

const r = (importance: number, examRelevance: number, interviewRelevance: number, difficulty = 3) => ({ importance, examRelevance, interviewRelevance, difficulty });
describe('priority formula', () => {
  it('all ones -> 0 and all fives -> 100', () => { expect(priorityScore(r(1, 1, 1))).toBe(0); expect(priorityScore(r(5, 5, 5))).toBe(100); });
  it('importance 5, exam 4, interview 5 -> about 92', () => { expect(priorityScore(r(5, 4, 5))).toBe(92); });
  it('difficulty does not affect the score', () => { expect(priorityScore(r(4, 3, 2, 1))).toBe(priorityScore(r(4, 3, 2, 5))); expect(summarize([r(4, 3, 2, 1)]).priorityScore).toBe(summarize([r(4, 3, 2, 5)]).priorityScore); });
  it('confidence does not affect the score', () => { const one = summarize([r(5, 4, 5)]); const many = summarize(Array.from({ length: 9 }, () => r(5, 4, 5))); expect(one.priorityScore).toBe(many.priorityScore); expect(one.confidence.label).not.toBe(many.confidence.label); });
  it('rejects out-of-range ratings', () => { expect(() => priorityScore(r(0, 3, 3))).toThrow(); expect(() => summarize([r(6, 3, 3)])).toThrow(); expect(() => summarize([r(3.5, 3, 3)])).toThrow(); });
});
describe('labels and confidence', () => {
  it('uses the agreed priority bands', () => { expect([100, 85, 84, 70, 69, 50, 49, 0].map(priorityLabel)).toEqual(['Must Study', 'Must Study', 'High Priority', 'High Priority', 'Medium', 'Medium', 'Low', 'Low']); });
  it('uses the agreed sample-size labels', () => { expect([0, 1, 2, 3, 5, 6, 40].map(confidenceLabel)).toEqual(['No ratings yet', 'Limited data', 'Limited data', 'Early signal', 'Early signal', 'Broader community signal', 'Broader community signal']); });
});
describe('empty and senior-only summaries', () => {
  it('no ratings means null score, never zero', () => { const s = summarize([]); expect(s.priorityScore).toBeNull(); expect(s.priorityLabel).toBeNull(); expect(s.message).toBe('No ratings yet'); expect(s.means).toBeNull(); });
  it('senior-only uses the snapshot level and has its own empty message', () => {
    const t = summarizeTopic([{ ...r(5, 5, 5), level: 'JUNIOR' }, { ...r(1, 1, 1), level: 'JUNIOR' }]);
    expect(t.overall.sampleCount).toBe(2); expect(t.senior.sampleCount).toBe(0); expect(t.senior.priorityScore).toBeNull(); expect(t.senior.message).toBe('No senior ratings yet.');
    const u = summarizeTopic([{ ...r(5, 5, 5), level: 'SENIOR' }, { ...r(1, 1, 1), level: 'JUNIOR' }]); expect(u.senior.priorityScore).toBe(100); expect(u.overall.priorityScore).toBe(50);
  });
});
