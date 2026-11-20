/** Shows server timestamps (ISO) in the reader's own timezone; leaves demo text like "2h ago" untouched. */
export function formatWhen(at: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(at)) return at; const d = new Date(at); if (Number.isNaN(d.getTime())) return at;
  const mins = Math.round((Date.now() - d.getTime()) / 60000); if (mins >= 0 && mins < 1) return 'Just now'; if (mins > 0 && mins < 60) return `${mins} min ago`;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
