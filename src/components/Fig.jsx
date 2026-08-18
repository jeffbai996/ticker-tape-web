import { useEffect, useRef, useState } from 'preact/hooks'
import { metricFlashDirection, scheduleFlashExpiry, TICK_FLASH_MS } from '../lib/tickFlash.js'
import { onVisibilityChange } from '../lib/visibility.js'

export { TICK_FLASH_MS } from '../lib/tickFlash.js'

// How long the resume baseline suppresses paint — one coalesced catch-up
// render's worth, just past the frame the feed hook lands it on.
const BASELINE_SETTLE_MS = 80

// Figures with quiet units: magnitude letters (T/M/B/d) drop to gray and
// ~82% size, signs and % just drop size — the digits carry the weight.
export function Fig({ v, class: cls = '' }) {
  const s = v == null ? '—' : String(v)
  if (!/\d/.test(s)) return <span class={cls}>{s}</span>
  const parts = s.split(/([A-Za-z]+|[%+])/g).filter(Boolean)
  return (
    <span class={cls}>
      {parts.map((p, i) =>
        /^[A-Za-z]+$/.test(p)
          ? <span key={i} class="text-muted text-[82%]">{p}</span>
          : /^[%+]$/.test(p)
            ? <span key={i} class="text-[82%]">{p}</span>
            : p)}
    </span>
  )
}


// Inverse-video tick flash on just the digits that changed. A hidden tab is
// allowed to absorb as many prints as it wants, but those prices become the
// new baseline instead of queueing a wall of paint for the user's return.
//
// Neither expiry below is a timer of this cell's own: a 37-row board is ~450
// of these, and one `setTimeout` per cell per print was the biggest idle timer
// source on the dashboard. Both deadlines go to the board-wide sweep in
// tickFlash.js, which keeps exactly one wakeup for the whole board.
export function FlashMetric({ value, fmt, kind = 'change' }) {
  const text = value != null ? fmt(value) : '—'
  const prevRef = useRef({ text, value })
  const latestRef = useRef({ text, value })
  const baselinePendingRef = useRef(false)
  const cancelBaselineRef = useRef(null)
  const cancelFlashRef = useRef(null)
  const [st, setSt] = useState(null)
  latestRef.current = { text, value }

  const endFlash = () => {
    cancelFlashRef.current?.()
    cancelFlashRef.current = null
  }
  const endBaseline = () => {
    cancelBaselineRef.current?.()
    cancelBaselineRef.current = null
  }

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const rebaseline = () => {
      prevRef.current = latestRef.current
      baselinePendingRef.current = true
      endBaseline()
      // The feed hook lands hidden-tab catch-up on the next animation frame.
      // Drop this flag shortly after that frame so the next real tick paints.
      if (!document.hidden) {
        cancelBaselineRef.current = scheduleFlashExpiry(BASELINE_SETTLE_MS, () => {
          cancelBaselineRef.current = null
          baselinePendingRef.current = false
        })
      }
      endFlash()
      setSt(null)
    }
    // one document listener for the whole board (visibility.js): a cell per
    // metric × a row per symbol used to mean ~1200 live listeners
    const off = onVisibilityChange(rebaseline)
    return () => {
      off()
      endBaseline()
    }
  }, [])

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = { text, value }
    const dir = metricFlashDirection(prev.value, value, {
      kind,
      baselinePending: baselinePendingRef.current,
      hidden: typeof document !== 'undefined' && document.hidden,
    })
    // Consume the resume baseline on the one coalesced catch-up render.
    if (prev.value != null && value != null && prev.value !== value
        && !(typeof document !== 'undefined' && document.hidden)) {
      baselinePendingRef.current = false
    }
    if (!dir) {
      endFlash()
      setSt(null)
      return undefined
    }
    let i = 0
    while (i < Math.min(prev.text.length, text.length) && prev.text[i] === text[i]) i++
    setSt({ dir, from: i })
    endFlash()
    cancelFlashRef.current = scheduleFlashExpiry(TICK_FLASH_MS, () => {
      cancelFlashRef.current = null
      setSt(null)
    })
    return endFlash
  }, [kind, text, value])
  if (!st) return <>{text}</>
  return (
    <>
      {text.slice(0, st.from)}
      <span class={`px-flash-${st.dir}`}>{text.slice(st.from)}</span>
    </>
  )
}

export function FlashPrice({ price, fmt }) {
  return <FlashMetric value={price} fmt={fmt} />
}
