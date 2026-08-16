/**
 * Keep the quote cache hot while a tab is hidden, but collapse every feed
 * notification before the next visible animation frame into one render. The
 * render reads the cache, so it always lands directly on the newest values.
 */
export function createQuoteRenderGate({
  isHidden,
  scheduleFrame,
  cancelFrame,
  scheduleTimer = globalThis.setTimeout.bind(globalThis),
  cancelTimer = globalThis.clearTimeout.bind(globalThis),
  maxWaitMs = 250,
  render,
}) {
  let pending = false
  let frame = null
  let timer = null
  let disposed = false

  const clearScheduled = (source) => {
    if (source !== 'frame' && frame != null) cancelFrame(frame)
    if (source !== 'timer' && timer != null) cancelTimer(timer)
    frame = null
    timer = null
  }

  const flush = (source) => {
    clearScheduled(source)
    if (disposed || isHidden() || !pending) return
    pending = false
    render()
  }

  const schedule = () => {
    if (disposed || isHidden() || !pending) return
    if (frame == null) frame = scheduleFrame(() => flush('frame'))
    // A visible desktop window can have rAF deprioritized when it is occluded
    // or its larger DOM keeps the main thread busy. Cap publication latency so
    // received stream ticks do not sit invisible for several seconds.
    if (timer == null) timer = scheduleTimer(() => flush('timer'), maxWaitMs)
  }

  return {
    onFeedUpdate() {
      pending = true
      schedule()
    },
    onVisibilityChange() {
      if (isHidden()) {
        clearScheduled()
        return
      }
      schedule()
    },
    dispose() {
      disposed = true
      pending = false
      clearScheduled()
    },
  }
}
