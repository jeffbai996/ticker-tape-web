/** Calendar urgency is independent of the locale's market gain/loss palette:
 *  `danger` stays red where `down` turns green in the red-up palette. Five
 *  steps, so the nearest days still separate from the rest of the week. */
export function earningsTone(days) {
  return days <= 0 ? 'text-imminent font-bold'
    : days <= 3 ? 'text-danger font-bold'
    : days <= 7 ? 'text-soon'
    : days <= 21 ? 'text-accent' : 'text-ink-2'
}
