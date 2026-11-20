import { describe, expect, it } from 'vitest';
import { contribStats, distribution, percentages, subjectStats, themes } from './stats';
import type { Rating } from '../types';

const r = (userId: string, topicId: string, importance: number, advice = '', extra: Partial<Rating> = {}): Rating =>
  ({ id: `${userId}-${topicId}`, topicId, userId, importance, difficulty: 3, exam: 4, interview: 2, advice, mistakes: '', at: '2026-09-01', level: 'Junior', ...extra });

describe('percentages', () => {
  it('sums to exactly 100 and is all zeros with no votes', () => {
    expect(percentages([1, 1, 1, 0, 0]).reduce((a, b) => a + b, 0)).toBe(100); expect(percentages([0, 0, 0, 0, 0])).toEqual([0, 0, 0, 0, 0]);
    expect(percentages([3, 3, 3, 3, 3]).reduce((a, b) => a + b, 0)).toBe(100);
  });
});
describe('distribution', () => {
  it('computes mean, votes and counts from real ratings', () => {
    const d = distribution([r('a', 't', 5), r('b', 't', 5), r('c', 't', 3), r('d', 't', 4)], 'importance');
    expect(d.votes).toBe(4); expect(d.counts).toEqual([0, 0, 1, 1, 2]); expect(d.mean).toBeCloseTo(4.25); expect(d.percents).toEqual([0, 0, 25, 25, 50]);
  });
  it('has no mean when nobody voted', () => { expect(distribution([], 'exam').mean).toBeNull(); });
});
describe('contribStats', () => {
  it('counts only non-empty advice, de-duplicates texts and counts distinct people once', () => {
    const rs = [r('a', 't', 5, 'Trace small examples'), r('b', 't', 4, '  trace small  EXAMPLES '), r('c', 't', 3, '   '), r('a', 'u', 2, 'Another one')];
    expect(contribStats(rs)).toMatchObject({ votes: 4, feedback: 3, distinctDescriptions: 2, contributors: 3 });
  });
});
describe('subjectStats', () => {
  it('aggregates across topics without counting a person twice as a contributor', () => {
    const rs = [r('a', 't1', 5), r('a', 't2', 4), r('b', 't1', 5), r('c', 't1', 4)];
    const st = subjectStats(['t1', 't2', 't3'], 2, rs);
    expect(st).toMatchObject({ votes: 4, contributors: 3, topics: 3, units: 2, withConsensus: 1, limited: 1, unrated: 1 });
  });
});
describe('themes', () => {
  it('needs two different students and ignores one person repeating a word', () => {
    expect(themes([r('a', 't', 5, 'practice recursion daily'), r('a', 'u', 5, 'practice again')]).length).toBe(0);
    expect(themes([r('a', 't', 5, 'practice recursion daily'), r('b', 't', 5, 'more practice helps')])[0]).toEqual({ word: 'practice', users: 2 });
  });
});
