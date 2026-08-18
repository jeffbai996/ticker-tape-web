// Koyfin-style chart workbench: one lightweight-charts instance, price in
// pane 0, RSI/MACD as native synced panes below. Overlays and panes toggle
// from the toolbar and persist; compare mode swaps the frame to normalized
// % lines so cross-symbol reads are honest.

import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, CandlestickSeries, LineSeries, AreaSeries,
         HistogramSeries } from 'lightweight-charts'
import { fetchHistory, RANGES } from '../lib/history.js'
import { fetchOptions } from '../lib/options.js'
import { expectedMove } from '../lib/optionsIntel.js'
import { smaSeries, emaSeries, rsiSeries, macdSeries, bollingerSeries,
         normalizedSeries } from '../lib/chartmath.js'
import { vwapSeries } from '../lib/vwap.js'
import { boundedTimeScale, marketTimeLabel, trendlinePrimitive, projectSegment } from '../lib/chartview.js'
import { nearestDrawing } from '../lib/chartmath.js'
import { loadDrawings, addDrawing, removeDrawing, clearDrawings } from '../lib/chartDrawings.js'
import { fmtPrice } from '../lib/format.js'
import { tl } from '../lib/i18n.js'

const KEY = 'tape-chartsuite-v1'
const UP = '#3fb950'
const DOWN = '#f85149'
const SMA_COLORS = { sma20: '#f59e0b', sma50: '#22d3ee', sma200: '#c084fc' }
const CMP_COLOR = '#22d3ee'
const DRAW = '#e7ecf3'
const DRAW_SEL = '#f59e0b'
// A fingertip is nowhere near a mouse pointer: this is the tap radius for
// "which drawing did you mean", not a cursor-precision hit box.
const TAP_TOL = 14

const DEFAULTS = {
  range: '6M', type: 'candles', log: false, ext: false,
  // Bar interval, keyed BY RANGE so 1D can sit on 1m while 6M stays daily —
  // one shared value would be wrong for whichever window you left last.
  ticks: {},
  ov: { vol: true }, panes: {},
}

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
    if (saved.range === '1D') saved.range = '2D'
    return { ...DEFAULTS, ...saved }
  }
  catch { return { ...DEFAULTS } }
}

const CHART_OPTS = {
  autoSize: true,
  layout: {
    background: { color: 'transparent' },
    textColor: '#79828d',
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 10,
    panes: { separatorColor: 'rgba(255,255,255,0.10)', separatorHoverColor: 'rgba(245,158,11,0.3)' },
  },
  grid: {
    vertLines: { color: 'rgba(255,255,255,0.05)' },
    horzLines: { color: 'rgba(255,255,255,0.05)' },
  },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.10)' },
  timeScale: boundedTimeScale(false),
  crosshair: { mode: 0 },
}

export function ChartSuite({ symbol }) {
  const el = useRef(null)
  const legendRef = useRef(null)
  const chartRef = useRef(null)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [cmp, setCmp] = useState('')
  const [cmpDraft, setCmpDraft] = useState('')
  const [state, setState] = useState('loading')
  const [bars, setBars] = useState(null)
  const barsSymbolRef = useRef(null)
  const [cmpBars, setCmpBars] = useState(null)
  const [intraday, setIntraday] = useState(false)
  // Drawings live outside the chart-building effect: adding a line must not
  // tear down and rebuild the whole chart. The series handle and an epoch
  // counter are how the annotation effects find the current chart again.
  const seriesRef = useRef(null)
  const [epoch, setEpoch] = useState(0)
  const [drawings, setDrawings] = useState(() => loadDrawings(symbol))
  const [mode, setMode] = useState(null) // null | 'hline' | 'trend'
  const [pending, setPending] = useState(null) // first point of a trendline
  const [sel, setSel] = useState(null) // id of the tapped drawing, for delete
  // Expected-move bands: the front-month ATM straddle's implied move, lazy-
  // fetched only once the EM overlay is switched on so plain chart views
  // never pay for an options-chain request.
  const [emMove, setEmMove] = useState(null)
  const emLinesRef = useRef([])
  const comparing = !!(cmp && cmpBars && cmpBars.length)
  // A fixed 430px left a black void under the chart on tall windows and at
  // low zoom (Jeff 2026-08-07). Measure the room actually left below the
  // toolbars — off the SCROLL CONTAINER, not innerHeight, so the phone's
  // bottom nav can't sit on top of the chart.
  const [fillH, setFillH] = useState(430)
  useEffect(() => {
    const measure = () => {
      const node = el.current
      if (!node) return
      const host = node.closest('.overflow-y-auto')
      // the scroller's own bottom padding is the phone's nav strip — inside
      // the box, but not room the chart may use
      const padB = host ? parseFloat(getComputedStyle(host).paddingBottom) || 0 : 0
      const bottom = host ? host.getBoundingClientRect().bottom - padB : innerHeight
      const room = Math.round(bottom - node.getBoundingClientRect().top - 12)
      setFillH(Math.max(280, Math.min(1100, room)))
    }
    measure()
    addEventListener('resize', measure)
    const ro = new ResizeObserver(measure)
    if (el.current?.parentElement) ro.observe(el.current.parentElement)
    return () => { removeEventListener('resize', measure); ro.disconnect() }
  }, [state])

  const save = (next) => {
    setPrefs(next)
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  const setP = (patch) => save({ ...prefs, ...patch })
  const toggleOv = (k) => setP({ ov: { ...prefs.ov, [k]: !prefs.ov[k] } })
  const togglePane = (k) => setP({ panes: { ...prefs.panes, [k]: !prefs.panes[k] } })

  const activeRange = RANGES.find((r) => r.key === prefs.range)
  const timeAxis = !!activeRange?.intraday
  // null means "the range's own default interval". Validated against the
  // current range's list so a stored tick from another window can't leak
  // through and ask Yahoo for a pair it rejects.
  const tick = activeRange?.ticks?.includes(prefs.ticks?.[prefs.range])
    ? prefs.ticks[prefs.range]
    : null
  const setTick = (v) => setP({ ticks: { ...prefs.ticks, [prefs.range]: v } })

  useEffect(() => {
    barsSymbolRef.current = null
    setBars(null)
    setState('loading')
  }, [symbol])

  useEffect(() => {
    let dead = false
    if (barsSymbolRef.current !== symbol) setState('loading')
    fetchHistory(symbol, prefs.range, { prepost: !!prefs.ext, interval: tick })
      .then((h) => {
        if (dead) return
        barsSymbolRef.current = symbol
        setBars(h.bars)
        setIntraday(!!h.intraday)
        setState(h.bars.length ? 'ok' : 'empty')
      })
      .catch(() => {
        if (!dead && barsSymbolRef.current !== symbol) setState('error')
      })
    return () => { dead = true }
  }, [symbol, prefs.range, prefs.ext, tick])

  useEffect(() => { setCmpBars(null) }, [cmp, symbol])

  useEffect(() => {
    let dead = false
    if (!cmp) return
    // same interval as the primary series, or the two would not line up
    fetchHistory(cmp, prefs.range, { prepost: !!prefs.ext, interval: tick })
      .then((h) => { if (!dead) setCmpBars(h.bars) })
      .catch(() => {})
    return () => { dead = true }
  }, [cmp, prefs.range, prefs.ext, tick, symbol])

  useEffect(() => {
    if (!el.current || !bars || !bars.length) return
    const chart = createChart(el.current, {
      ...CHART_OPTS,
      localization: timeAxis ? { timeFormatter: marketTimeLabel } : undefined,
      timeScale: boundedTimeScale(timeAxis),
      rightPriceScale: {
        ...CHART_OPTS.rightPriceScale,
        mode: prefs.log && !cmp ? 1 : 0,
      },
    })
    chartRef.current = chart
    let priceSeries
    if (comparing) {
      priceSeries = chart.addSeries(LineSeries,
        { color: '#e7ecf3', lineWidth: 2, priceLineVisible: false })
      priceSeries.setData(normalizedSeries(bars))
      const cs = chart.addSeries(LineSeries,
        { color: CMP_COLOR, lineWidth: 2, priceLineVisible: false })
      cs.setData(normalizedSeries(cmpBars))
    } else if (prefs.type === 'candles') {
      priceSeries = chart.addSeries(CandlestickSeries, {
        upColor: UP, downColor: DOWN, borderUpColor: UP,
        borderDownColor: DOWN, wickUpColor: UP, wickDownColor: DOWN,
      })
      priceSeries.setData(bars)
    } else {
      const up = bars[bars.length - 1].close >= bars[0].close
      priceSeries = chart.addSeries(
        prefs.type === 'area' ? AreaSeries : LineSeries,
        prefs.type === 'area'
          ? { lineColor: up ? UP : DOWN, lineWidth: 2,
              topColor: up ? 'rgba(63,185,80,.25)' : 'rgba(248,81,73,.25)',
              bottomColor: 'rgba(0,0,0,0)' }
          : { color: up ? UP : DOWN, lineWidth: 2 })
      priceSeries.setData(bars.map((b) => ({ time: b.time, value: b.close })))
    }

    if (!comparing) {
      for (const k of ['sma20', 'sma50', 'sma200']) {
        if (!prefs.ov[k]) continue
        const n = Number(k.slice(3))
        if (bars.length < n) continue
        chart.addSeries(LineSeries, { color: SMA_COLORS[k], lineWidth: 1,
          priceLineVisible: false, lastValueVisible: false })
          .setData(smaSeries(bars, n))
      }
      if (prefs.ov.ema21 && bars.length >= 21) {
        chart.addSeries(LineSeries, { color: '#e7ecf3', lineWidth: 1,
          lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
          .setData(emaSeries(bars, 21))
      }
      if (prefs.ov.bb && bars.length >= 20) {
        const bb = bollingerSeries(bars)
        for (const part of [bb.upper, bb.lower]) {
          chart.addSeries(LineSeries, { color: 'rgba(192,132,252,.5)',
            lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
            .setData(part)
        }
      }
      if (prefs.ov.vwap && intraday) {
        chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1,
          lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
          .setData(vwapSeries(bars))
      }
      if (prefs.ov.vol && bars.some((b) => b.volume)) {
        const vol = chart.addSeries(HistogramSeries, {
          priceScaleId: 'vol', priceFormat: { type: 'volume' },
          priceLineVisible: false, lastValueVisible: false,
        })
        chart.priceScale('vol').applyOptions({
          scaleMargins: { top: 0.85, bottom: 0 } })
        vol.setData(bars.map((b) => ({ time: b.time, value: b.volume || 0,
          color: b.close >= b.open ? 'rgba(63,185,80,.3)' : 'rgba(248,81,73,.3)' })))
      }
    }

    // sub-panes: native lightweight-charts v5 panes stay time-synced free
    let paneIdx = 1
    if (prefs.panes.rsi && bars.length > 15) {
      const rsiS = chart.addSeries(LineSeries,
        { color: '#f59e0b', lineWidth: 1 }, paneIdx)
      rsiS.setData(rsiSeries(bars))
      rsiS.createPriceLine({ price: 70, color: 'rgba(248,81,73,.4)', lineWidth: 1, lineStyle: 3, axisLabelVisible: false })
      rsiS.createPriceLine({ price: 30, color: 'rgba(63,185,80,.4)', lineWidth: 1, lineStyle: 3, axisLabelVisible: false })
      paneIdx++
    }
    if (prefs.panes.macd && bars.length > 40) {
      const m = macdSeries(bars)
      chart.addSeries(HistogramSeries, { priceLineVisible: false,
        lastValueVisible: false }, paneIdx).setData(m.hist)
      chart.addSeries(LineSeries, { color: '#22d3ee', lineWidth: 1,
        priceLineVisible: false }, paneIdx).setData(m.macd)
      chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1,
        priceLineVisible: false }, paneIdx).setData(m.signal)
      paneIdx++
    }
    try {
      const panes = chart.panes()
      for (let i = 1; i < panes.length; i++) panes[i].setHeight(96)
    } catch { /* pane sizing is garnish */ }

    // crosshair legend: OHLC readout, koyfin-style
    const byTime = new Map(bars.map((b) => [b.time, b]))
    const paint = (b) => {
      if (!legendRef.current || !b) return
      const up = b.close >= b.open
      legendRef.current.textContent = comparing
        ? ''
        : `O ${fmtPrice(b.open)}  H ${fmtPrice(b.high)}  L ${fmtPrice(b.low)}  C ${fmtPrice(b.close)}`
          + (b.volume ? `  V ${Intl.NumberFormat('en-US', { notation: 'compact' }).format(b.volume)}` : '')
      legendRef.current.style.color = up ? UP : DOWN
    }
    paint(bars[bars.length - 1])
    chart.subscribeCrosshairMove((param) => {
      const b = param?.time != null ? byTime.get(param.time) : null
      paint(b || bars[bars.length - 1])
    })
    chart.timeScale().fitContent()
    // Drawings hang off the MAIN price series only. In compare mode that
    // series holds % change, not price, so there is nothing honest to anchor
    // to — leave it null and the annotation effects sit out entirely.
    seriesRef.current = comparing ? null : priceSeries
    setEpoch((e) => e + 1)
    return () => {
      if (chartRef.current === chart) chartRef.current = null
      if (seriesRef.current === priceSeries) seriesRef.current = null
      chart.remove()
    }
  }, [bars, cmpBars, cmp, prefs.type, prefs.log, prefs.ov, prefs.panes, intraday, timeAxis])

  // Reload annotations when the symbol changes, and drop any half-finished
  // gesture — a pending trendline point belongs to the chart you left.
  useEffect(() => {
    setDrawings(loadDrawings(symbol))
    setMode(null)
    setPending(null)
    setSel(null)
  }, [symbol])

  // Compare mode has no price axis to draw on, so it also cancels drawing mode
  // rather than leaving a toggle armed that silently does nothing.
  useEffect(() => {
    if (comparing) { setMode(null); setPending(null); setSel(null) }
  }, [comparing])

  useEffect(() => {
    if (!mode && !pending) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      setMode(null)
      setPending(null)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [mode, pending])

  // Paint the stored drawings onto the current chart. Horizontal lines use the
  // library's own price lines (free axis label, free re-projection); trendlines
  // use a series primitive, which the library re-runs on every scroll/zoom.
  useEffect(() => {
    const series = seriesRef.current
    if (!series || comparing) return
    const attached = []
    for (const d of drawings) {
      const on = d.id === sel
      try {
        if (d.type === 'hline') {
          const line = series.createPriceLine({
            price: d.points[0].price,
            color: on ? DRAW_SEL : DRAW,
            lineWidth: on ? 2 : 1,
            lineStyle: 0,
            axisLabelVisible: true,
            title: '',
          })
          attached.push(() => series.removePriceLine(line))
        } else {
          const prim = trendlinePrimitive({
            points: d.points, color: on ? DRAW_SEL : DRAW, width: 1.5 })
          prim.setSelected(on)
          series.attachPrimitive(prim)
          attached.push(() => series.detachPrimitive(prim))
        }
      } catch { /* a drawing that won't attach is not worth killing the chart for */ }
    }
    return () => {
      // The chart may already be gone (rebuild races this cleanup); detaching
      // from a disposed series throws and there is nothing left to clean.
      for (const off of attached) { try { off() } catch { /* already disposed */ } }
    }
  }, [drawings, sel, epoch, comparing])

  useEffect(() => {
    if (!prefs.ov.em) { setEmMove(null); return }
    let dead = false
    fetchOptions(symbol).then((chain) => {
      if (!dead) setEmMove(expectedMove(chain))
    }).catch(() => { if (!dead) setEmMove(null) })
    return () => { dead = true }
  }, [symbol, prefs.ov.em])

  // Two amber price lines at the last close ± the priced move. Applied
  // straight to the series (not part of the chart-rebuild effect above) so
  // toggling EM, or the fetch resolving after the fact, doesn't tear down and
  // recreate the whole chart — and idempotent by construction: every run
  // clears its own previous pair before drawing (or not drawing) a new one,
  // so repeated toggles can't accumulate stray lines.
  useEffect(() => {
    const series = seriesRef.current
    for (const line of emLinesRef.current) {
      try { series?.removePriceLine(line) } catch { /* series already gone */ }
    }
    emLinesRef.current = []
    if (!series || comparing || !prefs.ov.em || !emMove || !bars?.length) return
    const anchor = bars[bars.length - 1].close
    const title = `EM ±${emMove.pct.toFixed(1)}%`
    const up = series.createPriceLine({
      price: anchor + emMove.dollars, color: 'rgba(245,158,11,0.65)',
      lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title,
    })
    const down = series.createPriceLine({
      price: anchor - emMove.dollars, color: 'rgba(245,158,11,0.65)',
      lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: '',
    })
    emLinesRef.current = [up, down]
  }, [epoch, prefs.ov.em, emMove, bars, comparing])

  // Taps: place a drawing while a mode is armed, otherwise select one to delete.
  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series || comparing) return
    const onClick = (param) => {
      if (!param?.point) return
      const price = series.coordinateToPrice(param.point.y)
      if (price == null) return
      // param.time is only set over a real bar; off the end of the data the
      // coordinate lookup still gives us the nearest one.
      const time = param.time ?? chart.timeScale().coordinateToTime(param.point.x)
      if (mode === 'hline') {
        if (time == null) return
        setDrawings(addDrawing(symbol, { type: 'hline', points: [{ time, price }] }))
        setMode(null)
        return
      }
      if (mode === 'trend') {
        if (time == null) return
        if (!pending) { setPending({ time, price }); return }
        setDrawings(addDrawing(symbol,
          { type: 'trend', points: [pending, { time, price }] }))
        setPending(null)
        setMode(null)
        return
      }
      // No mode: this is a selection tap. Project every drawing to pixels and
      // take the nearest within a fingertip.
      const ts = chart.timeScale()
      const shapes = []
      for (const d of drawings) {
        if (d.type === 'hline') {
          shapes.push({ id: d.id, kind: 'h', y: series.priceToCoordinate(d.points[0].price) })
        } else {
          const g = projectSegment(d.points, series, ts)
          if (g) shapes.push({ id: d.id, kind: 'seg', ...g })
        }
      }
      const hit = nearestDrawing(shapes, param.point.x, param.point.y, TAP_TOL)
      setSel(hit ? hit.id : null)
    }
    chart.subscribeClick(onClick)
    return () => { try { chart.unsubscribeClick(onClick) } catch { /* disposed */ } }
  }, [epoch, mode, pending, drawings, symbol, comparing])

  // `touch-manipulation` kills the iPad's 300ms tap delay without touching the
  // size or the type — the toolbar has to stay visually identical.
  const chip = (on, label, cb, color, tip) => (
    <button
      onClick={cb}
      title={tip}
      class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shrink-0 touch-manipulation ${
        on ? 'border-accent-2/70 text-accent-2' : 'border-line text-muted hover:text-ink'}`}
      style={on && color ? { color, borderColor: color + '99' } : undefined}
    >
      {label}
    </button>
  )

  // Bar interval. Deliberately NOT the same control as the range chips above:
  // they were being read as more timeframe buttons, so these are smaller,
  // pill-shaped rather than square, and use the primary accent instead of
  // accent-2 — three cues, since size alone wasn't enough (Jeff 2026-08-07).
  const tickChip = (v) => {
    const on = (tick || activeRange?.interval) === v
    return (
      <button
        key={v}
        onClick={() => setTick(v)}
        title={`draw ${v} bars`}
        class={`font-mono text-[8.5px] leading-none px-1 py-[3px] rounded-full border whitespace-nowrap shrink-0 ${
          on ? 'border-accent/70 text-accent bg-accent-soft' : 'border-line/50 text-muted hover:text-ink'}`}
      >
        {v}
      </button>
    )
  }

  return (
    <div class="flex flex-col gap-1.5 select-none">
      <div class="flex flex-nowrap items-center gap-1 px-1 overflow-x-auto no-scrollbar">
        {/* timeframes wear the Overview page's accent-tinted borders so the
            two pickers read as the same control on both tabs (Jeff 2026-08-09) */}
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => setP({ range: r.key })}
            title={`${r.range} of ${r.interval} bars`}
            class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shrink-0 ${
              prefs.range === r.key
                ? 'border-accent-2 text-accent-2 bg-accent-2-soft'
                : 'border-accent/30 text-muted hover:text-ink hover:bg-surface-3'}`}>
            {r.key.toLowerCase()}
          </button>
        ))}
        {activeRange?.ticks && (
          <>
            <span class="w-2" />
            <span class="font-mono text-[8px] text-muted/70 tracking-widest shrink-0">BAR</span>
            {activeRange.ticks.map(tickChip)}
          </>
        )}
        <span class="w-2" />
        {['candles', 'line', 'area'].map((t) =>
          chip(prefs.type === t && !cmp, t.toUpperCase(), () => setP({ type: t }), null, `draw as ${t}`))}
        {chip(prefs.log && !cmp, 'LOG', () => setP({ log: !prefs.log }), null, 'logarithmic price scale — equal % moves get equal height')}
        {/* IBKR's extended-hours switch: 04:00–20:00 ET instead of the
            regular session alone (Jeff 2026-08-07). Daily bars have no
            session to split, so the chip only shows on intraday ranges. */}
        {/* Keyed on the RANGE, not the derived `intraday` flag: picking a
            sub-daily bar on a daily window makes the axis intraday, but
            fetchHistory only honours prepost when the range itself is
            intraday, so keying on the flag would render a dead switch. */}
        {activeRange?.intraday && chip(!!prefs.ext, 'EXT', () => setP({ ext: !prefs.ext }), null,
          'include pre-market and after-hours bars (04:00–20:00 ET)')}
      </div>
      <div class="flex flex-nowrap items-center gap-1 px-1 overflow-x-auto no-scrollbar">
        {chip(prefs.ov.sma20, 'SMA 20', () => toggleOv('sma20'), SMA_COLORS.sma20, '20-period simple moving average')}
        {chip(prefs.ov.sma50, 'SMA 50', () => toggleOv('sma50'), SMA_COLORS.sma50, '50-period simple moving average')}
        {chip(prefs.ov.sma200, 'SMA 200', () => toggleOv('sma200'), SMA_COLORS.sma200, '200-period simple moving average — the trend line')}
        {chip(prefs.ov.ema21, 'EMA 21', () => toggleOv('ema21'), null, '21-period exponential moving average — weights recent bars')}
        {chip(prefs.ov.bb, 'BB', () => toggleOv('bb'), null, 'Bollinger bands — 20-period mean ±2 standard deviations')}
        {intraday && chip(prefs.ov.vwap, 'VWAP', () => toggleOv('vwap'), null, 'volume-weighted average price, intraday only')}
        {chip(prefs.ov.vol, 'VOL', () => toggleOv('vol'), null, 'volume histogram under the price')}
        {!comparing && chip(prefs.ov.em, 'EM', () => toggleOv('em'), '#f59e0b',
          'expected-move bands — the front-month ATM straddle priced ± around the last close')}
        <span class="w-2" />
        {chip(prefs.panes.rsi, 'RSI', () => togglePane('rsi'), null, 'relative strength index in its own pane — 70 overbought, 30 oversold')}
        {chip(prefs.panes.macd, 'MACD', () => togglePane('macd'), null, 'MACD 12/26/9 in its own pane')}
        {chip(false, 'FIT', () => chartRef.current?.timeScale().fitContent(), null, 'reset zoom to the full loaded history')}
        {/* Drawing tools. Hidden outright in compare mode: the frame is % change
            there, so a price anchored line would be a lie, not a limitation. */}
        {!comparing && (
          <>
            <span class="w-2" />
            {chip(mode === 'hline', tl('LINE'),
              () => { setMode(mode === 'hline' ? null : 'hline'); setPending(null) },
              DRAW_SEL, tl('price line — tap the chart to drop a horizontal line at that price'))}
            {chip(mode === 'trend', pending ? `${tl('TREND')} ·1` : tl('TREND'),
              () => { setMode(mode === 'trend' ? null : 'trend'); setPending(null) },
              DRAW_SEL, tl('trendline — tap two points; Esc cancels'))}
            {sel && chip(true, tl('DELETE'),
              () => { setDrawings(removeDrawing(symbol, sel)); setSel(null) },
              DOWN, tl('delete the selected drawing'))}
            {!!drawings.length && chip(false, tl('CLEAR'),
              () => { setDrawings(clearDrawings(symbol)); setSel(null) },
              null, tl('remove every drawing on this symbol'))}
          </>
        )}
        <span class="w-2" />
        <form
          class="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); setCmp(cmpDraft.trim().toUpperCase()) }}
        >
          <span class="font-mono text-[9.5px] text-muted uppercase tracking-wider"
                title={tl('overlay comparison')}>{tl('vs')}</span>
          <input
            value={cmpDraft}
            onInput={(e) => setCmpDraft(e.currentTarget.value)}
            placeholder="SOXX…"
            class="w-16 bg-surface-2 border border-line rounded px-1.5 py-0.5 font-mono text-[10px] text-ink outline-none focus:border-accent"
          />
          {cmp && chip(true, `× ${cmp}`, () => { setCmp(''); setCmpDraft('') }, CMP_COLOR)}
        </form>
        <span ref={legendRef} class="ml-auto font-mono text-[10px] whitespace-nowrap" />
      </div>
      {state === 'loading' && (
        <div style={{ height: `${fillH}px` }} class="flex items-center justify-center font-mono text-[11px] text-muted">{tl('loading…')}</div>
      )}
      {state === 'error' && (
        <div style={{ height: `${fillH}px` }} class="flex items-center justify-center font-mono text-[11px] text-down">{tl('chart unavailable')}</div>
      )}
      {/* touch-action: pan-y is what makes pinch-zoom work on a tablet. The
          default `auto` lets the browser claim every gesture, so on iOS the
          chart never receives the pinch and zoom looks broken while desktop
          wheel-zoom works fine (Jeff 2026-08-07, iPad). NOT `none`, which is
          what the library docs suggest: this pane is sized to fill the
          viewport, so surrendering vertical panning would strand the reader
          on the chart with no way to scroll the page. pan-y keeps the page
          scrolling vertically and hands pinch + horizontal drag to the chart. */}
      <div ref={el}
           class={`w-full touch-pan-y ${mode ? 'cursor-crosshair' : ''}`}
           style={{ height: state === 'ok' ? `${fillH}px` : 0 }} />
    </div>
  )
}
