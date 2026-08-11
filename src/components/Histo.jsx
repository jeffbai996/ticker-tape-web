// TUI-style volume histogram spark: one bar per session, height by volume,
// colored by that day's close direction.
//
// Drawn into a fixed viewBox and sized by CSS so a narrow row can squeeze it
// rather than drop it. `preserveAspectRatio="none"` compresses the time axis
// while bar heights — the part carrying the signal — stay put.

import { useMemo } from 'preact/hooks'
import { bucketBars } from '../lib/sparks.js'

export function Histo({ bars, width = 130, height = 20, class: cls = '' }) {
  // Memoized on the bars' identity: preact re-sets dash-cased SVG attributes
  // via setAttribute on every diff even when unchanged, which invalidates
  // paint — a year-of-rects histogram repainted on every quote tick and
  // shimmered under OS/trackpad zoom (Jeff 2026-08-11). Same vnode back →
  // the diff skips the subtree entirely.
  return useMemo(() => renderHisto(bars, width, height, cls),
    [bars, width, height, cls])
}

function renderHisto(bars, width, height, cls) {
  if (!bars?.length) return <div style={{ width, height }} />
  // Down-sample to the pixels available. The feed carries a year of daily
  // bars (252), and drawing all of them into an 84px spark meant 252 rects at
  // a third of a pixel each — three times more detail than the box can
  // resolve, times every row on the page (Jeff 2026-08-07: markets slow to
  // load). Two pixels per bar is the finest that still reads as bars.
  const drawn = bucketBars(bars, Math.max(8, Math.floor(width / 2)))
  // Mean per bucket, not the sum: buckets are not all the same size (the last
  // one holds the remainder), and on a thin-volume series that lone short bar
  // read as a spike pattern (Jeff 2026-08-07, metals).
  const vol = (b) => (b.v || 0) / (b.n || 1)
  const max = Math.max(...drawn.map(vol), 1)
  const bw = width / drawn.length
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      width={width}
      height={height}
      class={`shrink-0 ${cls}`}
    >
      {drawn.map((b, i) => {
        const bh = Math.max(1, (vol(b) / max) * height)
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
