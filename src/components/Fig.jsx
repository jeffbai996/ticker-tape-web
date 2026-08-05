import { useEffect, useRef, useState } from 'preact/hooks'
import { metricFlashDirection, TICK_FLASH_MS } from '../lib/tickFlash.js'

export { TICK_FLASH_MS } from '../lib/tickFlash.js'

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
export function FlashMetric({ value, fmt, kind = 'change' }) {
  const text = value != null ? fmt(value) : '—'
  const prevRef = useRef({ text, value })
  const latestRef = useRef({ text, value })
  const baselinePendingRef = useRef(false)
  const baselineTimerRef = useRef(null)
  const timerRef = useRef(null)
  const [st, setSt] = useState(null)
  latestRef.current = { text, value }

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const rebaseline = () => {
      prevRef.current = latestRef.current
      baselinePendingRef.current = true
      clearTimeout(baselineTimerRef.current)
      // The feed hook lands hidden-tab catch-up on the next animation frame.
      // Drop this flag shortly after that frame so the next real tick paints.
      if (!document.hidden) {
        baselineTimerRef.current = setTimeout(() => {
          baselinePendingRef.current = false
        }, 80)
      }
      clearTimeout(timerRef.current)
      timerRef.current = null
      setSt(null)
    }
    document.addEventListener('visibilitychange', rebaseline)
    return () => {
      document.removeEventListener('visibilitychange', rebaseline)
      clearTimeout(baselineTimerRef.current)
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
      clearTimeout(timerRef.current)
      timerRef.current = null
      setSt(null)
      return
    }
    let i = 0
    while (i < Math.min(prev.text.length, text.length) && prev.text[i] === text[i]) i++
    setSt({ dir, from: i })
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setSt(null)
    }, TICK_FLASH_MS)
    return () => clearTimeout(timerRef.current)
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
