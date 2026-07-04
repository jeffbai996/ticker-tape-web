// Inline SVG sparkline; stroke follows day direction.

export function Spark({ data, up, width = 72, height = 20 }) {
  if (!data || data.length < 2) return <svg width={width} height={height} />

  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (width - 2) + 1
      const y = height - 2 - ((v - min) / span) * (height - 4)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg width={width} height={height} class="shrink-0">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? 'var(--color-up)' : 'var(--color-down)'}
        stroke-width="1.3"
        stroke-linejoin="round"
      />
    </svg>
  )
}
