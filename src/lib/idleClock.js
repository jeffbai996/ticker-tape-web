/** Clocks and polls that stop dead while nobody is looking.
 *
 *  A hidden tab still runs timers. Chrome throttles background `setInterval`
 *  but never stops it, so every wakeup on a buried tab still costs a render,
 *  a DOM write or a request — paid for a screen no one can see. Worse, a
 *  1 Hz clock left on a plain `setInterval` drifts: the callback lands a few
 *  milliseconds later each pass until it is repainting mid-second, showing a
 *  value that is already up to a second stale.
 *
 *  `startVisibleClock` fixes both: a self-correcting timeout aligned to the
 *  period boundary, cancelled outright while `document.hidden`, with one
 *  catch-up tick on the way back so whatever is on screen is current again
 *  before the reader can read it.
 *
 *  Nothing here is specific to a page — the tape's headline poll, the status
 *  bar clock, the wire's poll loops and the event countdown all want the
 *  same behaviour.
 */

/**
 * Milliseconds until the next `periodMs` boundary of the epoch clock.
 *
 * Pure. A 1 Hz caller lands just after the second flips instead of wherever
 * the previous callback happened to finish, so the painted value is never
 * stale and the clock never fires twice inside one second.
 */
export function alignedDelay(now, periodMs) {
  if (!(periodMs > 0)) return 0
  const into = ((now % periodMs) + periodMs) % periodMs
  return into === 0 ? periodMs : periodMs - into
}

/**
 * Run `tick` every `periodMs` while the document is visible.
 *
 * Returns a stop function. Timer and document are injectable so the whole
 * thing is unit-testable without a browser.
 *
 * `catchUp` is the one judgement call: a clock or a poll wants the immediate
 * tick on return because what is on screen is stale, but a job that MAKES
 * something each time it runs does not — alt-tabbing would mint a row per
 * switch. Pass `catchUp: false` for those.
 *
 * @param {number} periodMs
 * @param {() => void} tick
 * @param {{doc?: Document, now?: () => number, setTimer?: Function,
 *          clearTimer?: Function, align?: boolean, catchUp?: boolean}} [options]
 * @returns {() => void}
 */
export function startVisibleClock(periodMs, tick, options = {}) {
  const {
    doc = globalThis.document,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    align = true,
    catchUp = true,
  } = options

  let handle = null
  let stopped = false
  const isHidden = () => !!doc?.hidden

  const schedule = () => {
    if (stopped || isHidden()) return
    const delay = align ? alignedDelay(now(), periodMs) : periodMs
    handle = setTimer(() => {
      handle = null
      if (stopped || isHidden()) return
      tick()
      schedule()
    }, delay)
  }

  const onVisibility = () => {
    if (stopped) return
    if (isHidden()) {
      if (handle != null) { clearTimer(handle); handle = null }
      return
    }
    if (handle != null) return
    // The screen has been stale for however long the tab was buried; one
    // catch-up before resuming the cadence, not a wait of up to periodMs.
    if (catchUp) tick()
    schedule()
  }

  schedule()
  doc?.addEventListener?.('visibilitychange', onVisibility)

  return () => {
    stopped = true
    if (handle != null) { clearTimer(handle); handle = null }
    doc?.removeEventListener?.('visibilitychange', onVisibility)
  }
}
