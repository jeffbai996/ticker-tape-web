export const TICK_FLASH_MS = 1350

/** Decide whether a price transition deserves paint. Initial hydration and
 *  hidden/resume catch-up establish a baseline; only a later visible tick is
 *  an event the user actually witnessed. */
export function tickFlashDirection(previousPrice, nextPrice, {
  baselinePending = false,
  hidden = false,
} = {}) {
  if (previousPrice == null || nextPrice == null || previousPrice === nextPrice) return null
  if (baselinePending || hidden) return null
  return nextPrice > previousPrice ? 'up' : 'down'
}
