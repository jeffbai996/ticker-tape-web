import { useEffect, useRef, useState } from 'preact/hooks'
import {
  RESUME_FLASH_QUIET_MS, TICK_FLASH_MS, tickFlashDirection,
} from '../lib/tickFlash.js'

export { RESUME_FLASH_QUIET_MS, TICK_FLASH_MS } from '../lib/tickFlash.js'

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
export function FlashPrice({ price, fmt }) {
  const text = price != null ? fmt(price) : '—'
  const prevRef = useRef({ text, price })
  const latestRef = useRef({ text, price })
  const baselinePendingRef = useRef(true)
  // A route revisit remounts the dashboard without firing visibilitychange.
  // Give its streamer snapshot the same quiet landing as a restored tab.
  const quietUntilRef = useRef(Date.now() + RESUME_FLASH_QUIET_MS)
  const timerRef = useRef(null)
  const [st, setSt] = useState(null)
  latestRef.current = { text, price }

  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const rebaseline = () => {
      prevRef.current = latestRef.current
      baselinePendingRef.current = true
      quietUntilRef.current = document.hidden
        ? Number.POSITIVE_INFINITY
        : Date.now() + RESUME_FLASH_QUIET_MS
      clearTimeout(timerRef.current)
      timerRef.current = null
      setSt(null)
    }
    document.addEventListener('visibilitychange', rebaseline)
    return () => document.removeEventListener('visibilitychange', rebaseline)
  }, [])

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = { text, price }
    const dir = tickFlashDirection(prev.price, price, {
      baselinePending: baselinePendingRef.current,
      hidden: typeof document !== 'undefined' && document.hidden,
      quietUntil: quietUntilRef.current,
    })
    // Consume the mount/resume baseline only on a changed visible print. Each
    // symbol therefore absorbs its own delayed streamer catch-up independently.
    if (prev.price != null && price != null && prev.price !== price
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
  }, [price, text])
  if (!st) return <>{text}</>
  return (
    <>
      {text.slice(0, st.from)}
      <span class={`px-flash-${st.dir}`}>{text.slice(st.from)}</span>
    </>
  )
}
