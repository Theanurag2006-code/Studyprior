/**
 * Study streak = number of consecutive calendar days (UTC) with at least one MEANINGFUL activity,
 * ending today, or yesterday if nothing has been logged yet today. Meaningful activity is recorded only when
 * a study plan is completed (once per plan) or a study session is logged. A streak is never invented.
 */
export function computeStreak(activityDates: string[], today: string): number {
  const days = new Set(activityDates); const day = (iso: string, delta: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + delta * 864e5).toISOString().slice(0, 10);
  let cursor = days.has(today) ? today : day(today, -1); let n = 0;
  while (days.has(cursor)) { n++; cursor = day(cursor, -1); }
  return n;
}
