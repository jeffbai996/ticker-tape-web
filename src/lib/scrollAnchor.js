/** Keeping a chat transcript still across a reflow.
 *
 *  A transcript is read from the bottom: the newest message is the anchor and
 *  everything above it is history. So the invariant that matters is distance
 *  from the BOTTOM, not scrollTop. Holding scrollTop is what makes a text-size
 *  change feel broken — every bubble above the reader grows, and the message
 *  they were looking at slides out from under them.
 *
 *  Same contract as operator's `scaleKeepingView` (static/js/operator.js):
 *  capture before the reflow, restore after it.
 */

/** Treat the reader as pinned to the tail within this many px of the bottom. */
export const BOTTOM_EPSILON = 24

/** Read the reading position BEFORE the reflow. */
export function captureAnchor(el, epsilon = BOTTOM_EPSILON) {
  if (!el) return null
  return {
    atBottom: el.scrollHeight - el.scrollTop - el.clientHeight < epsilon,
    fromBottom: el.scrollHeight - el.scrollTop,
  }
}

/** The scrollTop that restores `anchor` against a post-reflow scrollHeight.
 *  A pinned reader gets the raw scrollHeight — browsers clamp an over-large
 *  scrollTop to the maximum, which is exactly "go to the bottom". */
export function restoredScrollTop(anchor, scrollHeight) {
  if (!anchor) return null
  if (anchor.atBottom) return scrollHeight
  return Math.max(0, scrollHeight - anchor.fromBottom)
}

/** Apply a captured anchor AFTER the reflow. Reading scrollHeight flushes
 *  pending layout, so the value read here is already the post-reflow one. */
export function restoreAnchor(el, anchor) {
  if (!el || !anchor) return
  const top = restoredScrollTop(anchor, el.scrollHeight)
  if (top !== null) el.scrollTop = top
}
