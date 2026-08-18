import { onVisibilityChange } from './visibility.js'

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

/** One timer for every flashing cell on the board.
 *
 *  Each cell used to arm its own `setTimeout(…, TICK_FLASH_MS)` on every
 *  print to take the inverse-video box back off. A 37-row board is ~450
 *  flashing cells, and a websocket batch repaints a big slice of them at
 *  once, so a busy tape kept hundreds of timers alive and armed/cleared one
 *  per cell per tick — the dominant idle timer source in the 2026-08-18
 *  audit. The expiry is the same job for all of them, so cells register a
 *  deadline and the module keeps exactly one wakeup: the earliest one owed.
 *
 *  Cells that flash in the same render pass share a deadline to the
 *  millisecond, so a batch of 40 prints costs ONE timer, not 40.
 *
 *  Everything is injectable because the interesting cases (a burst, a buried
 *  tab, a cell unmounting mid-flash) are miserable to reproduce with a real
 *  clock and trivial with a fake one.
 */

/** A browser timer may fire a hair early; a second wakeup to retire the last
 *  2ms of a flash is pure waste. Absorb that jitter instead of re-arming. */
const SWEEP_JITTER_MS = 4

export function createFlashScheduler({
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (handle) => clearTimeout(handle),
  watchVisibility = onVisibilityChange,
  isHidden = () => !!globalThis.document?.hidden,
} = {}) {
  const pending = new Map() // token -> { due, run }
  let handle = null
  let armedFor = Infinity
  let unwatch = null
  let nextToken = 0

  const disarm = () => {
    if (handle == null) return
    clearTimer(handle)
    handle = null
    armedFor = Infinity
  }

  // Nothing pending means nothing to sweep, so the hub subscription goes too —
  // an idle board (or a headless render) holds no timer and no listener.
  const release = () => {
    if (pending.size || !unwatch) return
    unwatch()
    unwatch = null
  }

  const earliestDue = () => {
    let at = Infinity
    for (const entry of pending.values()) if (entry.due < at) at = entry.due
    return at
  }

  const arm = () => {
    const at = earliestDue()
    if (at === Infinity || isHidden()) { disarm(); return }
    if (handle != null && armedFor <= at) return // an earlier wakeup covers it
    disarm()
    armedFor = at
    handle = setTimer(fire, Math.max(0, at - now()))
  }

  const sweep = () => {
    const deadline = now() + SWEEP_JITTER_MS
    const due = []
    for (const [token, entry] of pending) {
      if (entry.due <= deadline) { due.push(entry.run); pending.delete(token) }
    }
    // one bad cell must not strand the rest of the board mid-flash
    for (const run of due) { try { run() } catch { /* the cell's problem */ } }
    release()
  }

  function fire() {
    handle = null
    armedFor = Infinity
    sweep()
    arm()
  }

  const onFlip = () => {
    // A hidden tab pays nothing: the wakeup goes away and the flashes that
    // expired behind it are retired on the way back in, before first paint.
    if (isHidden()) { disarm(); return }
    sweep()
    arm()
  }

  return {
    /** Retire something in `delayMs`. @returns {() => void} cancel; idempotent. */
    after(delayMs, run) {
      if (typeof run !== 'function') return () => {}
      const token = ++nextToken
      pending.set(token, { due: now() + Math.max(0, delayMs || 0), run })
      if (!unwatch) unwatch = watchVisibility(onFlip)
      arm()
      return () => {
        if (!pending.delete(token)) return
        // The armed wakeup may now be early; it will sweep nothing and re-arm.
        if (!pending.size) { disarm(); release() }
      }
    },
    /** Test/diagnostic hooks. */
    pending: () => pending.size,
    armed: () => handle != null,
  }
}

const boardSweep = createFlashScheduler()

/** Register a flash expiry with the board-wide sweep. */
export function scheduleFlashExpiry(delayMs, run) {
  return boardSweep.after(delayMs, run)
}

/** Test/diagnostic hook — flashes currently waiting to be retired. */
export function pendingFlashCount() {
  return boardSweep.pending()
}
