import { describe, expect, it } from 'vitest';
import { findSimilar, toInput, validateDraft } from './catalog';
import { purposeLabel, validatePurpose } from './purposes';

describe('study purposes', () => {
  it('requires a custom purpose only for OTHER', () => {
    expect(validatePurpose('EXAMS', '')).toBeNull(); expect(validatePurpose('OTHER', '   ')).toBeTruthy(); expect(validatePurpose('OTHER', 'Hackathon')).toBeNull();
  });
  it('labels legacy items without a purpose as empty', () => { expect(purposeLabel({})).toBe(''); expect(purposeLabel({ purpose: 'OTHER', customPurpose: '  My  goal ' })).toBe('My goal'); });
});
describe('catalog helpers', () => {
  const subs = [{ name: 'Data Structures' }, { name: 'Operating Systems' }];
  it('finds likely duplicates', () => { expect(findSimilar('data  structures', subs)).toHaveLength(1); expect(findSimilar('Data Structure & Algorithms', subs).length).toBeGreaterThan(0); expect(findSimilar('Thermodynamics', subs)).toHaveLength(0); });
  it('validates a draft and normalizes input', () => {
    const d = { name: ' Machine   Learning ', branch: 'Computer Science', semester: 6, description: '', topics: [{ name: 'Regression', unit: '', description: '', hours: '' }, { name: 'regression', unit: '', description: '', hours: '' }] };
    expect(validateDraft(d)['topic-1']).toBeTruthy();
    expect(validateDraft({ ...d, topics: [] }).topics).toBeTruthy();
    expect(validateDraft({ ...d, topics: [d.topics[0]] })).toEqual({});
    expect(toInput({ ...d, topics: [d.topics[0]] }).name).toBe('Machine Learning'); expect(toInput({ ...d, topics: [d.topics[0]] }).topics[0].unit).toBe('General');
  });
});
