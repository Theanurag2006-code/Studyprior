/** Consecutive UTC days with at least one meaningful activity, ending today (or yesterday if today has none yet). Never invented. */
export function computeStreak(activityDays, today) {
  const days = new Set(activityDays); const shift = (iso, d) => new Date(Date.parse(`${iso}T00:00:00Z`) + d * 864e5).toISOString().slice(0, 10);
  let cursor = days.has(today) ? today : shift(today, -1); let n = 0;
  while (days.has(cursor)) { n++; cursor = shift(cursor, -1); }
  return n;
}
