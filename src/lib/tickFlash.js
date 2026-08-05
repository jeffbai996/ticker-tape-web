export const TICK_FLASH_MS = 1350

/** Decide whether a live metric transition deserves paint. Initial hydration
 *  and hidden/resume catch-up establish a baseline; only a later visible tick
 *  is an event the user actually witnessed. High/low labels are stricter:
 *  paint only when the tape makes a genuine new session extreme. */
export function metricFlashDirection(previousValue, nextValue, {
  kind = 'change',
  baselinePending = false,
  hidden = false,
} = {}) {
  if (previousValue == null || nextValue == null || previousValue === nextValue) return null
  if (baselinePending || hidden) return null
  if (kind === 'high') return nextValue > previousValue ? 'up' : null
  if (kind === 'low') return nextValue < previousValue ? 'down' : null
  return nextValue > previousValue ? 'up' : 'down'
}

/** Backwards-compatible price-specific name used by existing tests/callers. */
export function tickFlashDirection(previousPrice, nextPrice, options = {}) {
  return metricFlashDirection(previousPrice, nextPrice, options)
}
