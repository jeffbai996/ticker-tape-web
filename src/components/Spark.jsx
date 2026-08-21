// The board's spark column, in five readings of the same cached daily bars:
// volume (the original histogram), price line, price area, daily change comb
// and daily range. Picked from the board menu, drawn here (Jeff 2026-08-07).
//
// Every shape uses the Histo contract: a fixed viewBox sized by CSS with
// `preserveAspectRatio="none"`, so a narrow row squeezes the time axis while
// the heights that carry the signal stay put.

import { useMemo } from 'preact/hooks'
import { Histo } from './Histo.jsx'
import {
  linePoints, baselineSegments, changeBars, rangeBars, sparkWindow, bucketBars,
  DEFAULT_WINDOW, MAX_DRAWN_BARS,
} from '../lib/sparks.js'

const UP = '#3fb950'
const DOWN = '#f85149'

function Frame({ width, height, class: cls = '', children }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none"
      width={width} height={height} class={`shrink-0 ${cls}`}>
      {children}
    </svg>
  )
}

function PriceSpark({ bars, width, height, class: cls, fill }) {
  const line = linePoints(bars, width, height)
  if (!line) return <div style={{ width, height }} />
  const color = line.up ? UP : DOWN
  return (
    <Frame width={width} height={height} class={cls}>
      {fill && (
        <polygon points={`0,${height} ${line.points} ${width},${height}`}
          fill={color} opacity="0.16" />
      )}
      <polyline points={line.points} fill="none" stroke={color}
        stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    </Frame>
  )
}

function BaselineSpark({ bars, width, height, class: cls }) {
  const out = baselineSegments(bars, width, height)
  if (!out) return <div style={{ width, height }} />
  return (
    <Frame width={width} height={height} class={cls}>
      <line x1="0" x2={width} y1={out.baseline} y2={out.baseline}
        stroke="#79828d" stroke-width="0.4" opacity="0.45" stroke-dasharray="2 2" />
      {out.segs.map((seg, i) => (
        <polyline key={i} points={seg.points} fill="none" stroke={seg.up ? UP : DOWN}
          stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
      ))}
    </Frame>
  )
}

function ChangeSpark({ bars, width, height, class: cls }) {
  const rows = changeBars(bars)
  if (!rows.length) return <div style={{ width, height }} />
  const mid = height / 2
  const bw = width / rows.length
  return (
    <Frame width={width} height={height} class={cls}>
      <line x1="0" x2={width} y1={mid} y2={mid} stroke="#79828d" stroke-width="0.4" opacity="0.5" />
      {rows.map((r, i) => {
        const bh = Math.max(0.6, r.frac * (mid - 0.5))
        return (
          <rect key={i} x={i * bw} width={Math.max(1, bw - 0.9)}
            y={r.up ? mid - bh : mid} height={bh}
            fill={r.up ? UP : DOWN} opacity="0.85" />
        )
      })}
    </Frame>
  )
}

function RangeSpark({ bars, width, height, class: cls }) {
  const rows = rangeBars(bars)
  if (!rows.length) return <div style={{ width, height }} />
  const bw = width / rows.length
  return (
    <Frame width={width} height={height} class={cls}>
      {rows.map((r, i) => {
        const top = (1 - r.hi) * height
        const bottom = (1 - r.lo) * height
        return (
          <rect key={i} x={i * bw + Math.max(0, bw / 2 - 0.6)} width={Math.min(1.2, Math.max(0.8, bw - 1.2))}
            y={top} height={Math.max(0.8, bottom - top)}
            fill={r.up ? UP : DOWN} opacity="0.8" />
        )
      })}
    </Frame>
  )
}

export function Spark({ type = 'vol', window = DEFAULT_WINDOW, bars,
                        width = 150, height = 24, class: cls = '' }) {
  // Same memo rationale as Histo: identical SVG re-diffs still repaint
  // (preact setAttribute on dash-cased props), so sparks shimmered under
  // OS zoom on every quote tick (Jeff 2026-08-11).
  return useMemo(() => renderSpark(type, window, bars, width, height, cls),
    [type, window, bars, width, height, cls])
}

function renderSpark(type, window, bars, width, height, cls) {
  if (type === 'off') return null
  const win = sparkWindow(bars, window)
  // a line can carry 252 points; bars can't — over ~60 they bucket into weeks
  const drawn = type === 'line' || type === 'area' || type === 'base' ? win : bucketBars(win, MAX_DRAWN_BARS)
  if (type === 'line') return <PriceSpark bars={drawn} width={width} height={height} class={cls} />
  if (type === 'base') return <BaselineSpark bars={drawn} width={width} height={height} class={cls} />
  if (type === 'area') return <PriceSpark bars={drawn} width={width} height={height} class={cls} fill />
  if (type === 'chg') return <ChangeSpark bars={drawn} width={width} height={height} class={cls} />
  if (type === 'range') return <RangeSpark bars={drawn} width={width} height={height} class={cls} />
  return <Histo bars={drawn} width={width} height={height} class={cls} />
}
