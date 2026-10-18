/** Calendar urgency is independent of the locale's market gain/loss palette. */
export function earningsTone(days) {
  return days <= 0 ? 'text-imminent font-bold'
    : days <= 7 ? 'text-accent' : 'text-ink-2'
}
