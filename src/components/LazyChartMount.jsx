import { useEffect, useState } from 'preact/hooks'

// The dashboard only draws a chart once a row is expanded, yet the chart
// mount (and the helpers it drags in) sat on the board's initial JS graph —
// 32 KB a phone paid before the first price (waterfall, 2026-08-22). Same
// props as ChartMount; the real one arrives on first use and is cached.
let loaded = null
const loadMount = () => (loaded ||= import('./LazyChart.jsx').then((m) => m.ChartMount))

export function ChartMount(props) {
  const [Real, setReal] = useState(() => null)
  useEffect(() => {
    let live = true
    loadMount().then((C) => { if (live) setReal(() => C) }).catch(() => {})
    return () => { live = false }
  }, [])
  if (!Real) return <div class={props.class || ''}>{props.placeholder || null}</div>
  return <Real {...props} />
}
