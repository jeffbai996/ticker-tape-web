/** Height of a bottom-docked console while its top edge is dragged. */
export function consoleHeightAt(startHeight, startY, pointerY, viewportHeight) {
  const wanted = startHeight + (startY - pointerY)
  return Math.max(120, Math.min(viewportHeight * 0.8, wanted))
}

export const COMPACT_H = 110
const TAP_SLOP_PX = 6

/** A pointer that barely moved between down and up is a tap, not a drag. */
export function isTap(startY, endY) {
  return Math.abs(endY - startY) <= TAP_SLOP_PX
}

/** Next posture when the grab bar is tapped: compact peek → the user's stored
 *  drag height → tall (80vh) → compact. If the stored height already is the
 *  tall stop, skip the duplicate so a tap always visibly changes something. */
export function nextConsolePosture(current, { stored, viewport }) {
  const tall = Math.round(viewport * 0.8)
  const storedIsTall = stored >= tall - 4
  if (current === 'compact') {
    return storedIsTall ? { posture: 'tall', height: tall } : { posture: 'stored', height: stored }
  }
  if (current === 'stored') return { posture: 'tall', height: tall }
  return { posture: 'compact', height: COMPACT_H }
}
