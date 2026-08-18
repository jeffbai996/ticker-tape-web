/**
 * Which rows a board can honestly say are on screen.
 *
 * IntersectionObserver hands back one entry per crossing, in whatever order
 * the browser batched them, as often as a scroll wants to fire. The feed wants
 * the opposite: a DOM-ordered symbol list that changes only when the SET
 * changes, at most once a frame. Two rules do the whole job —
 *
 *   1. every callback books ONE frame; the frame reads the current state
 *   2. the read is compared against the last one and emits nothing if equal
 *
 * so a scroll inside the same rows costs zero state updates and zero renders.
 * Everything here is pure bookkeeping over injected clocks — the hook in
 * hooks.js supplies the real observer and the real frame.
 */

/** The board marks its rows with data-row-symbol; that attribute is the join. */
export const symbolOfRow = (el) => el?.dataset?.rowSymbol || ''

export function createInViewTracker({
  schedule, cancel, emit, symbolOf = symbolOfRow, max = Infinity,
}) {
  let order = []           // observed elements, in DOM order
  const visible = new Set() // elements currently intersecting
  let frame = null
  // The caller starts with an empty viewport, so an empty first read is not
  // news: seeding the key with '' keeps the mount silent.
  let lastKey = ''
  let disposed = false

  const read = () => {
    const out = []
    const seen = new Set()
    for (const el of order) {
      if (!visible.has(el)) continue
      const symbol = symbolOf(el)
      if (!symbol || seen.has(symbol)) continue
      seen.add(symbol)
      out.push(symbol)
      if (out.length >= max) break
    }
    return out
  }

  const flush = () => {
    frame = null
    if (disposed) return
    const symbols = read()
    const key = symbols.join(',')
    if (key === lastKey) return // same rows on screen: no update, no re-render
    lastKey = key
    emit(symbols, key)
  }

  const wake = () => {
    if (disposed || frame != null) return
    frame = schedule(flush)
  }

  return {
    /** The rows the board is currently rendering, in DOM order. Anything that
     *  left the board stops counting as visible the moment it is gone. */
    setElements(elements) {
      order = [...(elements || [])]
      const live = new Set(order)
      for (const el of [...visible]) if (!live.has(el)) visible.delete(el)
      wake()
    },

    /** An IntersectionObserver callback payload. */
    apply(entries) {
      for (const entry of entries || []) {
        if (entry.isIntersecting) visible.add(entry.target)
        else visible.delete(entry.target)
      }
      wake()
    },

    flush,
    current: read,

    dispose() {
      disposed = true
      if (frame != null) cancel(frame)
      frame = null
      visible.clear()
      order = []
    },
  }
}
