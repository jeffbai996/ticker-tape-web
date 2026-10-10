import { useEffect, useRef, useState } from 'preact/hooks'
import { AreaSeries, ColorType, createChart } from 'lightweight-charts'
import { fetchHistory, rangeReturn } from '../../src/lib/history.js'
import { fmtChange, fmtPct, fmtPrice, fmtVol } from '../../src/lib/format.js'
import { actionForKey } from '../lib/keys.js'
import { TV_RANGES, rowView, stepRange } from '../lib/view.js'

const CHART_W = 1824
const CHART_H = 660

const COLORS = {
  up: { line: '#3fb950', top: 'rgba(63,185,80,0.28)' },
  down: { line: '#f85149', top: 'rgba(248,81,73,0.28)' },
}

const ET_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
})
const ET_DAY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })
const ET_MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', year: 'numeric' })

/** Bars carry UNIX seconds; the axis reads in exchange time, not UTC. */
function axisLabel(time, intraday, longRange) {
  const d = new Date(time * 1000)
  if (intraday) return ET_TIME.format(d)
  return longRange ? ET_MONTH.format(d) : ET_DAY.format(d)
}

function useChart(host) {
  const chart = useRef(null)
  const series = useRef(null)
  useEffect(() => {
    chart.current = createChart(host.current, {
      width: CHART_W,
      height: CHART_H,
      layout: {
        background: { type: ColorType.Solid, color: '#050609' },
        textColor: '#a6adb6',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 20,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.10)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.10)', fixLeftEdge: true, fixRightEdge: true },
      crosshair: { vertLine: { visible: false }, horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    })
    series.current = chart.current.addSeries(AreaSeries, { lineWidth: 3, priceLineVisible: true })
    return () => { chart.current.remove(); chart.current = null }
  }, [])
  return { chart, series }
}

export function Detail({ symbol, entry, position }) {
  const host = useRef(null)
  const { chart, series } = useChart(host)
  const [range, setRange] = useState('2D')
  const [data, setData] = useState({ state: 'loading', bars: [] })
  const v = rowView(entry)
  const q = entry?.quote || {}

  useEffect(() => {
    const onKey = (e) => {
      const action = actionForKey(e)
      if (action === 'left' || action === 'right') {
        e.preventDefault()
        setRange((r) => stepRange(r, action === 'left' ? -1 : 1))
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let cancelled = false
    setData((d) => ({ ...d, state: 'loading' }))
    fetchHistory(symbol, range)
      .then((out) => { if (!cancelled) setData({ state: 'ready', bars: out.bars, intraday: out.intraday }) })
      .catch(() => { if (!cancelled) setData({ state: 'error', bars: [] }) })
    return () => { cancelled = true }
  }, [symbol, range])

  useEffect(() => {
    if (!series.current || data.state !== 'ready') return
    const bars = data.bars
    const up = bars.length < 2 || bars[bars.length - 1].close >= bars[0].close
    const c = COLORS[up ? 'up' : 'down']
    series.current.applyOptions({ lineColor: c.line, topColor: c.top, bottomColor: 'rgba(5,6,9,0)' })
    const longRange = range === '1Y' || range === '5Y'
    chart.current.applyOptions({
      localization: { timeFormatter: (t) => axisLabel(t, data.intraday, longRange) },
      timeScale: {
        timeVisible: !!data.intraday,
        tickMarkFormatter: (t) => axisLabel(t, data.intraday, longRange),
      },
    })
    series.current.setData(bars.map((b) => ({ time: b.time, value: b.close })))
    chart.current.timeScale().fitContent()
  }, [data])

  const ret = data.state === 'ready' ? rangeReturn(data.bars, q.price, range) : null
  const retDir = ret?.pct > 0 ? 'up' : ret?.pct < 0 ? 'down' : 'flat'

  return (
    <div class="tv-detail">
      <div class="tv-detail-head">
        <div>
          <div class="tv-detail-sym">{symbol}<span class="tv-detail-pos">{position}</span></div>
          <div class="tv-detail-name">{v.name}</div>
        </div>
        <div class="tv-detail-quote">
          <div class="tv-detail-price">{v.ready ? fmtPrice(v.price) : '—'}</div>
          <div class={`tv-detail-chg ${v.dir}`}>
            {v.ready ? `${fmtChange(v.change)}  ${fmtPct(v.pct)}` : ''}
          </div>
          {v.ext && (
            <div class={`tv-ext ${v.ext.dir}`}>
              {v.ext.label} {fmtPrice(v.ext.price)} {fmtPct(v.ext.pct)}
            </div>
          )}
        </div>
      </div>
      <div class="tv-detail-stats">
        <span><em>Prev close</em>{fmtPrice(q.prevClose)}</span>
        <span><em>Day range</em>{fmtPrice(q.dayLow)} – {fmtPrice(q.dayHigh)}</span>
        <span><em>Volume</em>{fmtVol(q.volume)}</span>
        {ret?.pct != null && <span><em>{range} return</em><b class={retDir}>{fmtPct(ret.pct)}</b></span>}
      </div>
      <div class="tv-ranges">
        {TV_RANGES.map((r) => <span key={r} class={`tv-range ${r === range ? 'is-on' : ''}`}>{r}</span>)}
        {data.state === 'loading' && <span class="tv-range-note">Loading</span>}
        {data.state === 'error' && <span class="tv-range-note">Chart data is unavailable. Try another range.</span>}
      </div>
      <div class="tv-chart" ref={host} />
      <footer class="tv-legend">
        <span class="tv-key"><b>◀ ▶</b>Range</span>
        <span class="tv-key"><b>▲ ▼</b>Previous or next symbol</span>
        <span class="tv-key"><b>Back</b>Close chart</span>
      </footer>
    </div>
  )
}
