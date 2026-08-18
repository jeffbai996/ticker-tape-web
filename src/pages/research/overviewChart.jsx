import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, AreaSeries } from 'lightweight-charts'
import { RANGES } from '../../lib/history.js'
import { vwapSeries } from '../../lib/vwap.js'
import { fmtPct, fmtVol } from '../../lib/format.js'
import { tl } from '../../lib/i18n.js'
import { emaSeries, macdSeries, trimToWindow, warmedBars } from '../../lib/chartmath.js'
import { boundedTimeScale, marketTimeLabel } from '../../lib/chartview.js'
import { memoWindow, overlayAutoscale } from '../../lib/chartScale.js'

const OV_KEY = 'tape-chart-ov'
const SMA_COLORS = { 20: '#f59e0b', 50: '#22d3ee', 200: '#c084fc' }
const BB_COLOR = 'rgba(192, 132, 252, 0.55)'   // quiet violet — bands are context, not signal

function rollingBB(bars, n = 20, mult = 2) {
  const up = []; const mid = []; const lo = []
  for (let i = n - 1; i < bars.length; i++) {
    const win = bars.slice(i - n + 1, i + 1)
    const m = win.reduce((a, b) => a + b.close, 0) / n
    const sd = Math.sqrt(win.reduce((a, b) => a + (b.close - m) ** 2, 0) / n)
    up.push({ time: bars[i].time, value: m + mult * sd })
    mid.push({ time: bars[i].time, value: m })
    lo.push({ time: bars[i].time, value: m - mult * sd })
  }
  return { up, mid, lo }
}

function rollingRsi(bars, n = 14) {
  if (bars.length < n + 1) return []
  const out = []
  let avgGain = 0; let avgLoss = 0
  for (let i = 1; i <= n; i++) {
    const d = bars[i].close - bars[i - 1].close
    if (d >= 0) avgGain += d; else avgLoss -= d
  }
  avgGain /= n; avgLoss /= n
  out.push({ time: bars[n].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) })
  for (let i = n + 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close
    avgGain = (avgGain * (n - 1) + Math.max(d, 0)) / n
    avgLoss = (avgLoss * (n - 1) + Math.max(-d, 0)) / n
    out.push({ time: bars[i].time, value: avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss) })
  }
  return out
}

function rollingSma(bars, n) {
  const out = []
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= n) sum -= bars[i - n].close
    if (i >= n - 1) out.push({ time: bars[i].time, value: sum / n })
  }
  return out
}

const OV_TYPE_KEY = 'research_ov_type'
const OV_TYPES = ['candles', 'line', 'area']

export function Candles({ bars, warmPad, intraday, timeAxis, ticks, tick, onTick, rangeKey, onRange,
                   ext = false, onExt, canExt = false }) {
  const el = useRef(null)
  const chartRef = useRef(null)
  const legendRef = useRef(null)
  const fittedBarsRef = useRef(null)
  const [ctype, setCtypeState] = useState(() => {
    const saved = localStorage.getItem(OV_TYPE_KEY)
    return OV_TYPES.includes(saved) ? saved : 'candles'
  })
  const setCtype = (t) => {
    setCtypeState(t)
    localStorage.setItem(OV_TYPE_KEY, t)
  }
  const [ov, setOv] = useState(() => {
    try { return JSON.parse(localStorage.getItem(OV_KEY) || '{"vol":true}') }
    catch { return { vol: true } }
  })
  const toggle = (k) => setOv((cur) => {
    const next = { ...cur, [k]: !cur[k] }
    localStorage.setItem(OV_KEY, JSON.stringify(next))
    return next
  })

  useEffect(() => {
    if (!el.current) return
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#79828d',
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.10)', autoScale: true },
      // an axis drag latches autoScale off; double-clicking either axis and
      // the FIT button below both put it back
      handleScale: { axisDoubleClickReset: { time: true, price: true } },
      // Bar resolution and window scale are separate. A 1Y window drawn with
      // 1h candles still needs calendar dates on the x-axis, not "09:30" for
      // every session; only the true 1D/5D windows use exchange-time labels.
      localization: timeAxis ? { timeFormatter: marketTimeLabel } : undefined,
      timeScale: boundedTimeScale(timeAxis),
      crosshair: { mode: 0 },
    })
    const series = ctype === 'candles'
      ? chart.addSeries(CandlestickSeries, {
          upColor: '#3fb950',
          downColor: '#f85149',
          borderUpColor: '#3fb950',
          borderDownColor: '#f85149',
          wickUpColor: '#3fb950',
          wickDownColor: '#f85149',
        })
      // direction color lands with the data — the window's up/down isn't
      // known until bars arrive
      : chart.addSeries(ctype === 'area' ? AreaSeries : LineSeries,
          { lineWidth: 2, priceLineVisible: true })
    chartRef.current = { chart, series, type: ctype, extra: [] }
    fittedBarsRef.current = null
    // crosshair legend: O H L C ±% vol at the top-left, like a real terminal;
    // line/area bars carry only a close, so the legend slims down with them
    chart.subscribeCrosshairMove((param) => {
      const lg = legendRef.current
      if (!lg) return
      const b = param?.seriesData?.get(series)
      if (!b || (b.open == null && b.value == null)) { lg.style.display = 'none'; return }
      lg.style.display = 'block'
      if (b.open == null) {
        lg.innerHTML = `<span style="color:#79828d">C</span> ${b.value.toFixed(2)}`
        return
      }
      const up = b.close >= b.open
      const pct = ((b.close / b.open) - 1) * 100
      lg.innerHTML =
        `<span style="color:#79828d">O</span> ${b.open.toFixed(2)} ` +
        `<span style="color:#79828d">H</span> ${b.high.toFixed(2)} ` +
        `<span style="color:#79828d">L</span> ${b.low.toFixed(2)} ` +
        `<span style="color:#79828d">C</span> <span style="color:${up ? '#3fb950' : '#f85149'}">${b.close.toFixed(2)} ${fmtPct(pct)}</span>` +
        (b.volume ? ` <span style="color:#79828d">V</span> ${fmtVol(b.volume)}` : '')
    })
    return () => chart.remove()
  }, [timeAxis, ctype])

  useEffect(() => {
    const c = chartRef.current
    if (!c || !bars) return
    // oscillators run on window + warm-up prefix, then get trimmed back to the
    // window — otherwise RSI starts 14 bars in and MACD 34, which reads as the
    // indicator "not going back as far as the candles" (Jeff 2026-08-06)
    const warmed = warmedBars(bars, warmPad)
    // Overlays get a bounded vote on the price scale: on an intraday window a
    // moving average is anchored in older, far-away prices and would otherwise
    // flatten the candles into a corner of the pane (chartScale.js).
    const windowAt = memoWindow(bars)
    const overlayScale = {
      autoscaleInfoProvider: overlayAutoscale(() => {
        const lr = c.chart.timeScale().getVisibleLogicalRange()
        return lr ? windowAt(lr.from, lr.to) : null
      }),
    }
    if (c.type === 'candles') {
      c.series.setData(bars)
    } else {
      const up = bars.length && bars[bars.length - 1].close >= bars[0].close
      c.series.applyOptions(c.type === 'area'
        ? { lineColor: up ? '#3fb950' : '#f85149', lineWidth: 2,
            topColor: up ? 'rgba(63,185,80,.25)' : 'rgba(248,81,73,.25)',
            bottomColor: 'rgba(0,0,0,0)' }
        : { color: up ? '#3fb950' : '#f85149' })
      c.series.setData(bars.map((b) => ({ time: b.time, value: b.close })))
    }
    c.chart.priceScale('right').applyOptions({ mode: ov.log ? 1 : 0 })
    c.extra.forEach((sr) => { try { c.chart.removeSeries(sr) } catch { /* gone */ } })
    c.extra = []
    // lightweight-charts preserves emptied oscillator panes. Without removing
    // them, every overlay click (SMA, VWAP, etc.) adds another blank pane and
    // progressively crushes the price chart upward.
    while (c.chart.panes().length > 1) {
      c.chart.removePane(c.chart.panes().length - 1)
    }
    for (const n of [20, 50, 200]) {
      if (!ov['sma' + n] || warmed.length < n) continue
      const line = c.chart.addSeries(LineSeries, {
        color: SMA_COLORS[n], lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false, ...overlayScale,
      })
      line.setData(trimToWindow(rollingSma(warmed, n), bars))
      c.extra.push(line)
    }
    if (ov.ema21 && bars.length >= 21) {
      const line = c.chart.addSeries(LineSeries, {
        color: '#e7ecf3', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false, ...overlayScale,
      })
      line.setData(trimToWindow(emaSeries(warmed, 21), bars))
      c.extra.push(line)
    }
    if (ov.bb && bars.length >= 20) {
      const { up, mid, lo } = rollingBB(warmed, 20, 2)
      for (const [data, style] of [[trimToWindow(up, bars), 0],
                                   [trimToWindow(mid, bars), 2],
                                   [trimToWindow(lo, bars), 0]]) {
        const line = c.chart.addSeries(LineSeries, {
          color: BB_COLOR, lineWidth: 1, lineStyle: style,
          priceLineVisible: false, lastValueVisible: false,
          crosshairMarkerVisible: false, ...overlayScale,
        })
        line.setData(data)
        c.extra.push(line)
      }
    }
    if (ov.vwap && intraday && bars.some((b) => b.volume)) {
      const line = c.chart.addSeries(LineSeries, {
        color: '#f59e0b', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false, ...overlayScale,
      })
      line.setData(vwapSeries(bars))
      c.extra.push(line)
    }
    // Volume hugs price; oscillators get native time-synced panes below it.
    if (ov.vol && bars.some((b) => b.volume)) {
      const vol = c.chart.addSeries(HistogramSeries, {
        priceScaleId: 'vol', priceFormat: { type: 'volume' },
        priceLineVisible: false, lastValueVisible: false,
      })
      c.chart.priceScale('vol').applyOptions({
        scaleMargins: { top: ov.rsi ? 0.88 : 0.82, bottom: 0 },
      })
      vol.setData(bars.map((b) => ({
        time: b.time, value: b.volume || 0,
        color: b.close >= b.open ? 'rgba(63,185,80,.35)' : 'rgba(248,81,73,.35)',
      })))
      c.extra.push(vol)
    }
    let paneIdx = 1
    if (ov.rsi && bars.length >= 15) {
      const rsiLine = c.chart.addSeries(LineSeries, {
        color: '#3ecbe8', lineWidth: 1,
        priceLineVisible: false, lastValueVisible: true,
      }, paneIdx)
      rsiLine.setData(trimToWindow(rollingRsi(warmed, 14), bars))
      rsiLine.createPriceLine({ price: 70, color: 'rgba(248,81,73,.4)', lineWidth: 1, lineStyle: 3, axisLabelVisible: false })
      rsiLine.createPriceLine({ price: 30, color: 'rgba(63,185,80,.4)', lineWidth: 1, lineStyle: 3, axisLabelVisible: false })
      c.extra.push(rsiLine)
      paneIdx++
    }
    if (ov.macd && bars.length >= 40) {
      const m = macdSeries(warmed)
      const hist = c.chart.addSeries(HistogramSeries, {
        priceLineVisible: false, lastValueVisible: false,
      }, paneIdx)
      const macdLine = c.chart.addSeries(LineSeries, {
        color: '#22d3ee', lineWidth: 1, priceLineVisible: false,
      }, paneIdx)
      const signal = c.chart.addSeries(LineSeries, {
        color: '#f59e0b', lineWidth: 1, priceLineVisible: false,
      }, paneIdx)
      hist.setData(trimToWindow(m.hist, bars))
      macdLine.setData(trimToWindow(m.macd, bars))
      signal.setData(trimToWindow(m.signal, bars))
      c.extra.push(hist, macdLine, signal)
      paneIdx++
    }
    try {
      const panes = c.chart.panes()
      for (let i = 1; i < panes.length; i++) panes[i].setHeight(84)
    } catch { /* pane sizing is garnish */ }
    // Indicator clicks must not reset the user's horizontal zoom. Fit only
    // when a genuinely new bar window lands (or the chart is recreated).
    if (fittedBarsRef.current !== bars) {
      c.chart.timeScale().fitContent()
      fittedBarsRef.current = bars
    }
  }, [bars, warmPad, ov, ctype])

  return (
    <div>
      {/* ChartSuite's toolbar layout, mirrored: timeframes + bar interval on
          the first row, indicator toggles on the second. Both pickers used to
          live in the page header, a screen away from the chart they drive
          (Jeff 2026-08-09: "time pills into the chart also") */}
      <div class="flex items-center gap-1 px-1 pb-1 select-none flex-nowrap w-full max-w-full overflow-x-auto no-scrollbar">
        {RANGES.map((r) => (
          <button key={r.key} onClick={() => onRange?.(r.key)}
            class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shrink-0 ${
              rangeKey === r.key
                ? 'border-accent-2 text-accent-2 bg-accent-2-soft'
                : 'border-accent/30 text-muted hover:text-ink hover:bg-surface-3'}`}>
            {r.key.toLowerCase()}
          </button>
        ))}
        {/* BAR + intervals + EXT wrap as ONE unit: as loose flex children the
            EXT pill wrapped onto a line of its own at narrow widths / zoom
            (Jeff 2026-08-11: "in ANY zoom level, EXT should not break out
            onto its own line"). */}
        {(ticks?.length > 0 || canExt) && (
          <span class="inline-flex items-center gap-1 flex-nowrap shrink-0">
            {ticks?.length > 0 && (
              <>
                <span class="w-2 shrink-0" />
                <span class="font-mono text-[8px] text-muted/70 tracking-widest shrink-0">BAR</span>
                {ticks.map((v) => (
                  <button key={v} onClick={() => onTick?.(v)} title={`draw ${v} bars`}
                    class={`font-mono text-[8.5px] leading-none px-1 py-[3px] rounded-full border whitespace-nowrap shrink-0 ${
                      tick === v ? 'border-accent/70 text-accent bg-accent-soft' : 'border-line/50 text-muted hover:text-ink'}`}>
                    {v}
                  </button>
                ))}
              </>
            )}
            {canExt && (
              <>
                <span class="w-0.5 shrink-0" />
                <button onClick={() => onExt?.(!ext)}
                  title="include pre-market and after-hours bars (04:00–20:00 ET)"
                  class={`font-mono text-[8.5px] leading-none px-1.5 py-[3px] rounded-full border whitespace-nowrap shrink-0 ${
                    ext ? 'border-accent/70 text-accent bg-surface-3' : 'border-line-2/70 bg-surface-3 text-ink-2 hover:text-ink'}`}>
                  EXT
                </button>
              </>
            )}
          </span>
        )}
      </div>
      <div class="flex gap-1 px-1 pb-1.5 select-none flex-nowrap overflow-x-auto no-scrollbar">
        {[['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['sma200', 'SMA 200'], ['ema21', 'EMA 21'], ['bb', 'BB'], ...(intraday ? [['vwap', 'VWAP']] : []), ['rsi', 'RSI'], ['macd', 'MACD'], ['vol', 'VOL'], ['log', 'LOG']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shrink-0 ${
              ov[k] ? 'border-accent-2/60 text-accent-2' : 'border-line text-muted hover:text-ink'
            }`}
            style={ov[k] && k.startsWith('sma') ? { color: SMA_COLORS[k.slice(3)], borderColor: SMA_COLORS[k.slice(3)] + '99' } : undefined}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => {
            const c = chartRef.current
            if (!c) return
            c.chart.timeScale().fitContent()
            c.chart.priceScale('right').applyOptions({ autoScale: true })
          }}
          title={tl('reset full history')}
          class="font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shrink-0 border-line text-muted hover:text-ink"
        >
          FIT
        </button>
        <span class="w-2 shrink-0" />
        {OV_TYPES.map((t) => (
          <button key={t} onClick={() => setCtype(t)} title={`draw as ${t}`}
            class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider whitespace-nowrap shrink-0 ${
              ctype === t ? 'border-accent-2/70 text-accent-2' : 'border-line text-muted hover:text-ink'}`}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      <div class="relative">
        <div ref={legendRef} class="absolute left-2 top-1 z-10 font-mono text-[10.5px] text-ink pointer-events-none" style="display:none" />
        <div ref={el} class="h-[352px] w-full touch-pan-y" />
      </div>
    </div>
  )
}
