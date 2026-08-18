import { useEffect, useRef, useState } from 'preact/hooks'
import { fetchHistory, peekHistory, RANGES } from '../../lib/history.js'

/** Read-and-clear a command-bar ride-along (chart range, options expiry). */
export function consumePrefill(key) {
  try {
    const v = sessionStorage.getItem(key)
    if (v) sessionStorage.removeItem(key)
    return v
  } catch { return null }
}

/** Everything the overview chart needs: the visible window, its bars, the
 *  warm-up prefix for long oscillators, and the sticky bar-interval/EXT
 *  choices — pulled out of Research() so the shell only has to consume it. */
export function useResearchChart(symbol) {
  const [rangeKey, setRangeKey] = useState(() => {
    const prefill = consumePrefill('chart_range')
    const saved = localStorage.getItem('research_overview_range_v1')
    const prior = prefill || saved
    const candidate = prior === '1D' ? '2D' : (prior || '6M')
    return RANGES.some((range) => range.key === candidate) ? candidate : '6M'
  })
  const selectRange = (nextRange) => {
    setRangeKey(nextRange)
    localStorage.setItem('research_overview_range_v1', nextRange)
  }
  useEffect(() => {
    const onRange = (e) => { selectRange(e.detail); sessionStorage.removeItem('chart_range') }
    window.addEventListener('tape:chart-range', onRange)
    return () => window.removeEventListener('tape:chart-range', onRange)
  }, [])
  const [hist, setHist] = useState(null)
  const histSymbolRef = useRef(symbol)
  const [warmPad, setWarmPad] = useState(null)
  const [err, setErr] = useState(null)
  // intraday tick override (1D: 1m/2m/5m/15m, 5D: 5m…1h) — the default 5m
  // was the ONLY resolution and that's no way to read an open (Jeff
  // 2026-08-06). Persisted per range so 1D can live on 1m while 5D stays 15m.
  const [ticks, setTicks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('research_ticks_v1')) || {} } catch { return {} }
  })
  // extended-hours bars on the Overview chart (Jeff 2026-08-10) — same
  // 04:00-20:00 ET series ChartSuite's EXT chip fetches; sticky across visits
  const [ovExt, setOvExtState] = useState(() => localStorage.getItem('research_ov_ext') === '1')
  const setOvExt = (on) => {
    setOvExtState(on)
    try { localStorage.setItem('research_ov_ext', on ? '1' : '0') } catch { /* best-effort */ }
  }
  const activeRange = RANGES.find((x) => x.key === rangeKey)
  const tick = activeRange?.ticks?.includes(ticks[rangeKey]) ? ticks[rangeKey] : null
  const setTick = (value) => {
    const next = { ...ticks, [rangeKey]: value }
    setTicks(next)
    try { localStorage.setItem('research_ticks_v1', JSON.stringify(next)) } catch { /* best-effort */ }
  }

  useEffect(() => {
    if (!symbol) return
    let dead = false
    const symbolChanged = histSymbolRef.current !== symbol
    histSymbolRef.current = symbol
    // stale-while-revalidate: paint the last bars for this range immediately
    // and let the fetch below replace them (2026-08-10)
    const seed = peekHistory(symbol, rangeKey, { interval: tick, prepost: ovExt })
    if (seed) setHist(seed)
    else if (symbolChanged) setHist(null)
    setErr(null)
    fetchHistory(symbol, rangeKey, { interval: tick, prepost: ovExt })
      .then((next) => { if (!dead) setHist(next) })
      .catch((e) => { if (!dead) setErr(String(e.message || e)) })
    // warm-up bars for the oscillators; failure is silent — indicators just
    // start where they used to
    if (symbolChanged) setWarmPad(null)
    fetchHistory(symbol, rangeKey, { warm: true, interval: tick, prepost: ovExt })
      .then((h) => { if (!dead) setWarmPad(h.bars) })
      .catch(() => {})
    return () => { dead = true }
  }, [symbol, rangeKey, tick, ovExt])

  return {
    rangeKey, selectRange, activeRange,
    hist, warmPad, err,
    tick, setTick,
    ovExt, setOvExt,
  }
}
