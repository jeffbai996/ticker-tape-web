/** Number of identical cycles needed to cover the viewport plus one spare. */
export function marqueeCopies(viewportWidth, cycleWidth) {
  if (!(viewportWidth > 0) || !(cycleWidth > 0)) return 2
  return Math.max(2, Math.ceil(viewportWidth / cycleWidth) + 1)
}

/** Keep a looping animation at the same travelled point after its duration
 *  changes. CSS animations can reset to zero when a custom duration is
 *  rewritten; wrapping the old clock into the new cycle avoids that snap. */
export function preservedMarqueeTime(currentTime, durationMs) {
  if (!Number.isFinite(currentTime) || !(durationMs > 0)) return null
  return ((currentTime % durationMs) + durationMs) % durationMs
}
