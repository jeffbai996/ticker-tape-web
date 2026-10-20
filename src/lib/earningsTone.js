/** Calendar urgency is independent of the locale's market gain/loss palette:
 *  `danger` stays red where `down` turns green in the red-up palette. */
export function earningsTone(days) {
  return days <= 0 ? 'text-imminent font-bold'
    : days <= 7 ? 'text-danger'
    : days <= 21 ? 'text-accent' : 'text-ink-2'
}
