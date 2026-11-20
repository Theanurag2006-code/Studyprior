export type Theme = 'light' | 'dark';
/**
 * Decides the starting theme from whatever was saved in this browser.
 * - nothing saved -> Light (the default for new users)
 * - 'light' / 'dark' -> respected
 * - legacy 'system' (an option that no longer exists) -> converted ONCE to whatever the OS prefers, so nobody's
 *   earlier choice flips unexpectedly; the caller re-saves the converted value.
 */
export function normalizeTheme(raw: string | null, osPrefersDark: boolean): Theme {
  if (raw === 'light' || raw === 'dark') return raw;
  if (raw === 'system') return osPrefersDark ? 'dark' : 'light';
  return 'light';
}
