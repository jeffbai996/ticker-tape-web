/**
 * Keep the quote cache hot while a tab is hidden, but collapse every feed
 * notification before the next visible animation frame into one render. The
 * render reads the cache, so it always lands directly on the newest values.
 */
export function createQuoteRenderGate({
  isHidden,
  scheduleFrame,
  cancelFrame,
  render,
}) {
  let pending = false
  let frame = null
  let disposed = false

  const schedule = () => {
    if (disposed || frame != null || isHidden() || !pending) return
    frame = scheduleFrame(() => {
      frame = null
      if (disposed || isHidden() || !pending) return
      pending = false
      render()
    })
  }

  return {
    onFeedUpdate() {
      pending = true
      schedule()
    },
    onVisibilityChange() {
      schedule()
    },
    dispose() {
      disposed = true
      pending = false
      if (frame != null) cancelFrame(frame)
      frame = null
    },
  }
}
