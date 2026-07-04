// TUI-style volume histogram spark: one bar per session, height by volume,
// colored by that day's close direction.

export function Histo({ bars, width = 130, height = 20 }) {
  if (!bars?.length) return <div style={{ width, height }} />
  const max = Math.max(...bars.map((b) => b.v), 1)
  const bw = width / bars.length
  return (
    <svg width={width} height={height} class="shrink-0">
      {bars.map((b, i) => {
        const bh = Math.max(1, (b.v / max) * height)
        return (
          <rect
            key={i}
            x={i * bw}
            y={height - bh}
            width={Math.max(1, bw - 0.9)}
            height={bh}
            fill={b.up ? '#3fb950' : '#f85149'}
            opacity="0.85"
          />
        )
      })}
    </svg>
  )
}
