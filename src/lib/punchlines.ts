/** Dashboard subtitles. One is shown per dashboard visit, rotating in order; nothing cycles while the page is open. */
export const PUNCHLINES = [
  'Know what actually matters. Skip the guesswork.',
  "Here's what matters today.",
  'Study smarter. Prioritize what moves you forward.',
] as const;
export const PUNCHLINE_KEY = 'studyprior-punchline';
/** `raw` is the index shown last time (or null on a first visit). Invalid or tampered values start from the first message. */
export function pickPunchline(raw: string | null): { index: number; text: string } {
  const n = raw !== null && /^\d+$/.test(raw) ? Number(raw) : -1;
  const last = n < PUNCHLINES.length ? n : -1; // out-of-range values count as invalid
  const index = last < 0 ? 0 : (last + 1) % PUNCHLINES.length;
  return { index, text: PUNCHLINES[index] };
}
