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
