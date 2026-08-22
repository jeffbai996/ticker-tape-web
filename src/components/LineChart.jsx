// A plain SVG line chart — several normalised series on shared dates, a
// dotted 100 line, and the last value of each series labelled at the right
// edge. No chart library: the 净值 page needs one honest line against three
// benchmarks, not candles and drawings.

const W = 720
const H = 220
const PAD = { l: 8, r: 54, t: 10, b: 18 }

export function LineChart({ dates, series, colors, baseline = 100 }) {
  const n = dates.length
  const all = series.flatMap((s) => s.values).filter((v) => v != null && Number.isFinite(v))
  if (n < 2 || !all.length) return null
  const lo = Math.min(baseline, ...all)
  const hi = Math.max(baseline, ...all)
  const span = hi - lo || 1
  const x = (i) => PAD.l + (i / (n - 1)) * (W - PAD.l - PAD.r)
  const y = (v) => PAD.t + (1 - (v - lo) / span) * (H - PAD.t - PAD.b)
  const path = (values) => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v == null || !Number.isFinite(v)) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    })
    return d
  }
  const lastOf = (values) => {
    for (let i = values.length - 1; i >= 0; i--) if (values[i] != null && Number.isFinite(values[i])) return [i, values[i]]
    return null
  }
  const ticks = [dates[0], dates[Math.floor((n - 1) / 2)], dates[n - 1]]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" class="block w-full h-[220px] max-sm:h-[180px]" role="img">
      <line x1={PAD.l} x2={W - PAD.r} y1={y(baseline)} y2={y(baseline)} stroke="currentColor" stroke-opacity="0.25" stroke-dasharray="3 4" />
      <defs>
        <linearGradient id="book-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color={colors[0]} stop-opacity="0.22" />
          <stop offset="1" stop-color={colors[0]} stop-opacity="0" />
        </linearGradient>
      </defs>
      {/* the book's own line gets a soft fill down to the baseline — the
          benchmarks stay as bare lines so the eye lands on the book */}
      {series[0] && (() => {
        const v = series[0].values
        let first = -1; let last = -1
        v.forEach((x, i) => { if (x != null && Number.isFinite(x)) { if (first < 0) first = i; last = i } })
        if (first < 0 || last <= first) return null
        const d = path(v.slice(0, last + 1)).trim()
        return <path d={`${d} L${x(last).toFixed(1)},${y(baseline).toFixed(1)} L${x(first).toFixed(1)},${y(baseline).toFixed(1)} Z`} fill="url(#book-fill)" stroke="none" />
      })()}
      {series.map((s, k) => (
        <path key={s.id} d={path(s.values)} fill="none" stroke={colors[k % colors.length]}
          stroke-width={k === 0 ? 2.2 : 1.4} stroke-opacity={k === 0 ? 1 : 0.85} vector-effect="non-scaling-stroke" />
      ))}
      {series.map((s, k) => {
        const last = lastOf(s.values)
        if (!last) return null
        return (
          <text key={`${s.id}-l`} x={W - PAD.r + 6} y={y(last[1]) + 3.5} fill={colors[k % colors.length]}
            font-size="10" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">{last[1].toFixed(1)}</text>
        )
      })}
      {ticks.map((d, i) => (
        <text key={d + i} x={i === 0 ? PAD.l : i === 1 ? W / 2 - 24 : W - PAD.r - 48} y={H - 4} fill="currentColor" fill-opacity="0.5"
          font-size="9" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">{d.slice(5)}</text>
      ))}
    </svg>
  )
}
