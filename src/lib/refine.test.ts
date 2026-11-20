import { describe, expect, it } from 'vitest';
import { PUNCHLINES, pickPunchline } from './punchlines';
import { normalizeTheme } from './theme';

describe('theme preference', () => {
  it('defaults to light and respects saved light/dark', () => {
    expect(normalizeTheme(null, true)).toBe('light'); expect(normalizeTheme('dark', false)).toBe('dark'); expect(normalizeTheme('light', true)).toBe('light'); expect(normalizeTheme('garbage', true)).toBe('light');
  });
  it('converts the removed System option once, following the OS', () => { expect(normalizeTheme('system', true)).toBe('dark'); expect(normalizeTheme('system', false)).toBe('light'); });
});
describe('dashboard punchlines', () => {
  it('starts at the first message and rotates in order, wrapping around', () => {
    expect(pickPunchline(null).text).toBe(PUNCHLINES[0]); expect(pickPunchline('0').text).toBe(PUNCHLINES[1]); expect(pickPunchline('1').text).toBe(PUNCHLINES[2]); expect(pickPunchline('2').text).toBe(PUNCHLINES[0]);
  });
  it('ignores invalid stored values and is stable for the same input', () => {
    expect(pickPunchline('abc').index).toBe(0); expect(pickPunchline('-1').index).toBe(0); expect(pickPunchline('99').index).toBe(0); expect(pickPunchline('1')).toEqual(pickPunchline('1'));
  });
  it('contains exactly the three requested messages', () => { expect([...PUNCHLINES]).toEqual(['Know what actually matters. Skip the guesswork.', "Here's what matters today.", 'Study smarter. Prioritize what moves you forward.']); });
});
