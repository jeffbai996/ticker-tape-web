// Spatial navigation for the remote: from the focused element's box, find
// the control a D-pad press should land on. Pure geometry; tv/remote.js
// supplies the boxes from the DOM.
//
// Scoring follows the usual TV focus-engine shape (and the WICG spatial
// navigation draft): only candidates fully past the near edge in the
// direction of travel count, distance along that axis is cheap, and drift
// across it is expensive, with overlapping boxes treated as aligned.

const OVERLAP_SLACK = 2 // list rows often share a 1px border
const CROSS_WEIGHT = 3

function axes(dir) {
  return dir === 'up' || dir === 'down'
    ? { near: dir === 'down' ? 'bottom' : 'top', far: dir === 'down' ? 'top' : 'bottom', lo: 'left', hi: 'right', sign: dir === 'down' ? 1 : -1 }
    : { near: dir === 'right' ? 'right' : 'left', far: dir === 'right' ? 'left' : 'right', lo: 'top', hi: 'bottom', sign: dir === 'right' ? 1 : -1 }
}

/** Best candidate `{ rect }` to move to from `from`, or null. */
export function pickNext(from, candidates, dir) {
  const { near, far, lo, hi, sign } = axes(dir)
  let best = null
  let bestScore = Infinity
  for (const c of candidates) {
    const r = c.rect
    if (r.left === from.left && r.top === from.top && r.width === from.width && r.height === from.height) continue
    // how far the candidate's leading edge is past ours, in travel direction
    const along = (r[far] - from[near]) * sign
    if (along < -OVERLAP_SLACK) continue
    // gap across the travel axis; zero when the boxes overlap on that axis
    const across = Math.max(0, r[lo] - from[hi], from[lo] - r[hi])
    const score = Math.max(0, along) + across * CROSS_WEIGHT
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

/** What the Back key does, in priority order. */
export function backAction({ layerOpen, textFocused, atHome }) {
  if (textFocused) return 'blur'
  if (layerOpen) return 'close-layer'
  return atHome ? 'exit' : 'history'
}

/** Pages visited this session, so Back can tell "go back" from "go home".
 *  Arriving at the previous page is treated as a back step. */
export function nextHashStack(stack, hash) {
  if (stack[stack.length - 1] === hash) return stack
  if (stack[stack.length - 2] === hash) return stack.slice(0, -1)
  return [...stack, hash]
}
