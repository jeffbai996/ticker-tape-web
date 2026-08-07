// Koyfin-style chart workbench: one lightweight-charts instance, price in
// pane 0, RSI/MACD as native synced panes below. Overlays and panes toggle
// from the toolbar and persist; compare mode swaps the frame to normalized
// % lines so cross-symbol reads are honest.

import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, CandlestickSeries, LineSeries, AreaSeries,
         HistogramSeries } from 'lightweight-charts'
import { fetchHistory, RANGES } from '../lib/history.js'
import { smaSeries, emaSeries, rsiSeries, macdSeries, bollingerSeries,
         normalizedSeries } from '../lib/chartmath.js'
import { vwapSeries } from '../lib/vwap.js'
import { boundedTimeScale } from '../lib/chartview.js'
import { fmtPrice } from '../lib/format.js'
import { tl } from '../lib/i18n.js'

const KEY = 'tape-chartsuite-v1'
const UP = '#3fb950'
const DOWN = '#f85149'
const SMA_COLORS = { sma20: '#f59e0b', sma50: '#22d3ee', sma200: '#c084fc' }
const CMP_COLOR = '#22d3ee'

const DEFAULTS = {
  range: '6M', type: 'candles', log: false, ext: false,
  ov: { vol: true }, panes: {},
}

function loadPrefs() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } }
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
  const [cmpBars, setCmpBars] = useState(null)
  const [intraday, setIntraday] = useState(false)
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

  useEffect(() => {
    let dead = false
    setState('loading')
    setBars(null)
    fetchHistory(symbol, prefs.range, { prepost: !!prefs.ext })
      .then((h) => {
        if (dead) return
        setBars(h.bars)
        setIntraday(!!h.intraday)
        setState(h.bars.length ? 'ok' : 'empty')
      })
      .catch(() => { if (!dead) setState('error') })
    return () => { dead = true }
  }, [symbol, prefs.range, prefs.ext])

  useEffect(() => {
    let dead = false
    setCmpBars(null)
    if (!cmp) return
    fetchHistory(cmp, prefs.range, { prepost: !!prefs.ext })
      .then((h) => { if (!dead) setCmpBars(h.bars) })
      .catch(() => {})
    return () => { dead = true }
  }, [cmp, prefs.range, prefs.ext, symbol])

  useEffect(() => {
    if (!el.current || !bars || !bars.length) return
    const chart = createChart(el.current, {
      ...CHART_OPTS,
      timeScale: boundedTimeScale(intraday),
      rightPriceScale: {
        ...CHART_OPTS.rightPriceScale,
        mode: prefs.log && !cmp ? 1 : 0,
      },
    })
    chartRef.current = chart
    const comparing = !!(cmp && cmpBars && cmpBars.length)
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
    return () => {
      if (chartRef.current === chart) chartRef.current = null
      chart.remove()
    }
  }, [bars, cmpBars, cmp, prefs, intraday])

  const chip = (on, label, cb, color, tip) => (
    <button
      onClick={cb}
      title={tip}
      class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shrink-0 ${
        on ? 'border-accent-2/70 text-accent-2' : 'border-line text-muted hover:text-ink'}`}
      style={on && color ? { color, borderColor: color + '99' } : undefined}
    >
      {label}
    </button>
  )

  return (
    <div class="flex flex-col gap-1.5 select-none">
      <div class="flex flex-nowrap items-center gap-1 px-1 overflow-x-auto no-scrollbar">
        {RANGES.map((r) => chip(prefs.range === r.key, r.key.toLowerCase(), () => setP({ range: r.key }), null, `${r.range} of ${r.interval} bars`))}
        <span class="w-2" />
        {['candles', 'line', 'area'].map((t) =>
          chip(prefs.type === t && !cmp, t.toUpperCase(), () => setP({ type: t }), null, `draw as ${t}`))}
        {chip(prefs.log && !cmp, 'LOG', () => setP({ log: !prefs.log }), null, 'logarithmic price scale — equal % moves get equal height')}
        {/* IBKR's extended-hours switch: 04:00–20:00 ET instead of the
            regular session alone (Jeff 2026-08-07). Daily bars have no
            session to split, so the chip only shows on intraday ranges. */}
        {intraday && chip(!!prefs.ext, 'EXT', () => setP({ ext: !prefs.ext }), null,
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
        <span class="w-2" />
        {chip(prefs.panes.rsi, 'RSI', () => togglePane('rsi'), null, 'relative strength index in its own pane — 70 overbought, 30 oversold')}
        {chip(prefs.panes.macd, 'MACD', () => togglePane('macd'), null, 'MACD 12/26/9 in its own pane')}
        {chip(false, 'FIT', () => chartRef.current?.timeScale().fitContent(), null, 'reset zoom to the full loaded history')}
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
      <div ref={el} class="w-full" style={{ height: state === 'ok' ? `${fillH}px` : 0 }} />
    </div>
  )
}
