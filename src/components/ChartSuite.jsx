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
import { fmtPrice } from '../lib/format.js'
import { tl } from '../lib/i18n.js'

const KEY = 'tape-chartsuite-v1'
const UP = '#3fb950'
const DOWN = '#f85149'
const SMA_COLORS = { sma20: '#f59e0b', sma50: '#22d3ee', sma200: '#c084fc' }
const CMP_COLOR = '#22d3ee'

const DEFAULTS = {
  range: '6M', type: 'candles', log: false,
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
  timeScale: { borderColor: 'rgba(255,255,255,0.10)' },
  crosshair: { mode: 0 },
}

export function ChartSuite({ symbol }) {
  const el = useRef(null)
  const legendRef = useRef(null)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [cmp, setCmp] = useState('')
  const [cmpDraft, setCmpDraft] = useState('')
  const [state, setState] = useState('loading')
  const [bars, setBars] = useState(null)
  const [cmpBars, setCmpBars] = useState(null)
  const [intraday, setIntraday] = useState(false)

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
    fetchHistory(symbol, prefs.range)
      .then((h) => {
        if (dead) return
        setBars(h.bars)
        setIntraday(!!h.intraday)
        setState(h.bars.length ? 'ok' : 'empty')
      })
      .catch(() => { if (!dead) setState('error') })
    return () => { dead = true }
  }, [symbol, prefs.range])

  useEffect(() => {
    let dead = false
    setCmpBars(null)
    if (!cmp) return
    fetchHistory(cmp, prefs.range)
      .then((h) => { if (!dead) setCmpBars(h.bars) })
      .catch(() => {})
    return () => { dead = true }
  }, [cmp, prefs.range, symbol])

  useEffect(() => {
    if (!el.current || !bars || !bars.length) return
    const chart = createChart(el.current, {
      ...CHART_OPTS,
      timeScale: { ...CHART_OPTS.timeScale, timeVisible: intraday },
      rightPriceScale: {
        ...CHART_OPTS.rightPriceScale,
        mode: prefs.log && !cmp ? 1 : 0,
      },
    })
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
    return () => chart.remove()
  }, [bars, cmpBars, cmp, prefs, intraday])

  const chip = (on, label, cb, color) => (
    <button
      onClick={cb}
      class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap ${
        on ? 'border-accent/70 text-accent' : 'border-line text-muted hover:text-ink'}`}
      style={on && color ? { color, borderColor: color + '99' } : undefined}
    >
      {label}
    </button>
  )

  return (
    <div class="flex flex-col gap-1.5 select-none">
      <div class="flex flex-wrap items-center gap-1 px-1">
        {Object.keys(RANGES).map((r) => chip(prefs.range === r, r, () => setP({ range: r })))}
        <span class="w-2" />
        {['candles', 'line', 'area'].map((t) =>
          chip(prefs.type === t && !cmp, t.toUpperCase(), () => setP({ type: t })))}
        {chip(prefs.log && !cmp, 'LOG', () => setP({ log: !prefs.log }))}
      </div>
      <div class="flex flex-wrap items-center gap-1 px-1">
        {chip(prefs.ov.sma20, 'SMA 20', () => toggleOv('sma20'), SMA_COLORS.sma20)}
        {chip(prefs.ov.sma50, 'SMA 50', () => toggleOv('sma50'), SMA_COLORS.sma50)}
        {chip(prefs.ov.sma200, 'SMA 200', () => toggleOv('sma200'), SMA_COLORS.sma200)}
        {chip(prefs.ov.ema21, 'EMA 21', () => toggleOv('ema21'))}
        {chip(prefs.ov.bb, 'BB', () => toggleOv('bb'))}
        {intraday && chip(prefs.ov.vwap, 'VWAP', () => toggleOv('vwap'))}
        {chip(prefs.ov.vol, 'VOL', () => toggleOv('vol'))}
        <span class="w-2" />
        {chip(prefs.panes.rsi, 'RSI', () => togglePane('rsi'))}
        {chip(prefs.panes.macd, 'MACD', () => togglePane('macd'))}
        <span class="w-2" />
        <form
          class="flex items-center gap-1"
          onSubmit={(e) => { e.preventDefault(); setCmp(cmpDraft.trim().toUpperCase()) }}
        >
          <span class="font-mono text-[9.5px] text-muted uppercase tracking-wider">{tl('vs')}</span>
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
        <div class="h-[430px] flex items-center justify-center font-mono text-[11px] text-muted">loading…</div>
      )}
      {state === 'error' && (
        <div class="h-[430px] flex items-center justify-center font-mono text-[11px] text-down">chart unavailable</div>
      )}
      <div ref={el} class={`w-full ${state === 'ok' ? 'h-[430px]' : 'h-0'}`} />
    </div>
  )
}
