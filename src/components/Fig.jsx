import { useEffect, useRef, useState } from 'preact/hooks'

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


// Inverse-video tick flash on just the digits that changed: diff the old and
// new price strings, paint the changed tail as a solid bright block for one
// second, then drop it. Crude on purpose — terminal, not material.
export function FlashPrice({ price, fmt }) {
  const text = price != null ? fmt(price) : '—'
  const prevRef = useRef({ text, price })
  const [st, setSt] = useState(null)
  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = { text, price }
    if (price == null || prev.price == null || price === prev.price) return
    let i = 0
    while (i < Math.min(prev.text.length, text.length) && prev.text[i] === text[i]) i++
    setSt({ dir: price > prev.price ? 'up' : 'down', from: i })
    const t = setTimeout(() => setSt(null), 1000)
    return () => clearTimeout(t)
  }, [price, text])
  if (!st) return <>{text}</>
  return (
    <>
      {text.slice(0, st.from)}
      <span class={`px-flash-${st.dir}`}>{text.slice(st.from)}</span>
    </>
  )
}
