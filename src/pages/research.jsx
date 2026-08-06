import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { useQuotes } from '../hooks.js'
import { fetchDividends as fetchDivHistory, fetchHistory, fetchNews, fetchSplits, RANGES } from '../lib/history.js'
import { fetchFinancials, statementRows } from '../lib/financials.js'
import { alignedReturns, regressStats } from '../lib/regress.js'
import { BUCKETS } from '../lib/symbols.js'
import { fetchFundamentals } from '../lib/fundamentals.js'
import { fetchOptions } from '../lib/options.js'
import { fetchInsider } from '../lib/fundamentals.js'
import { fetchEarningsImpact } from '../lib/earnings.js'
import { reconcileQuarters } from '../lib/earnings.js'
import { fetchAnalysts } from '../lib/fundamentals.js'
import { fetchProfile, fetchHolders } from '../lib/fundamentals.js'
import { fetchFilings } from '../lib/edgar.js'
import { wireUrl } from '../lib/wire.js'
import { bsDelta } from '../lib/bs.js'
import { vwapSeries } from '../lib/vwap.js'
import { LineSeries } from 'lightweight-charts'
import { sma, rsi, macd, bollinger } from '../lib/indicators.js'
import { fmtPrice, fmtPriceBare, fmtPct, fmtChange, fmtVol, fmtBig, fmtRatio, fmtFracPct } from '../lib/format.js'
import { hrefFor } from '../lib/route.js'
import { Marquee } from '../components/Marquee.jsx'
import { getLocale, tl, t as tt } from '../lib/i18n.js'
import { Fig, FlashMetric, FlashPrice } from '../components/Fig.jsx'
import { watch, unwatch } from '../lib/watchlist.js'
import { useWatchlist } from '../hooks.js'
import { getCached } from '../lib/feed.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { memoPrompt, BRIEFING_SYSTEM } from '../lib/briefing.js'
import { AiReport, MdLite } from '../components/AiReport.jsx'
import { ChartSuite } from '../components/ChartSuite.jsx'
import { emaSeries, macdSeries, trimToWindow, warmedBars } from '../lib/chartmath.js'
import { boundedTimeScale } from '../lib/chartview.js'
import { extendedLabelClass } from '../lib/extendedHours.js'

/** Read-and-clear a command-bar ride-along (chart range, options expiry). */
function consumePrefill(key) {
  try {
    const v = sessionStorage.getItem(key)
    if (v) sessionStorage.removeItem(key)
    return v
  } catch { return null }
}

/** Snapshot whatever the page already knows about a symbol into a memo
 *  prompt. Fetches are cache-first, so this is cheap at click time. */
async function buildMemoPrompt(symbol) {
  const cached = getCached(symbol)
  const [earn, analysts] = await Promise.all([
    fetchEarningsDate(symbol).catch(() => null),
    fetchAnalysts(symbol).catch(() => null),
  ])
  const earnDays = earn?.date != null
    ? Math.max(0, Math.round((earn.date - Date.now()) / 86_400_000))
    : null
  return {
    system: BRIEFING_SYSTEM,
    prompt: memoPrompt(symbol, {
      quote: cached?.quote,
      tech: cached?.tech,
      analysts: analysts?.targets,
      earnDays,
    }),
  }
}

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

function Candles({ bars, warmPad, intraday }) {
  const el = useRef(null)
  const chartRef = useRef(null)
  const legendRef = useRef(null)
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
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.10)' },
      timeScale: boundedTimeScale(intraday),
      crosshair: { mode: 0 },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#3fb950',
      downColor: '#f85149',
      borderUpColor: '#3fb950',
      borderDownColor: '#f85149',
      wickUpColor: '#3fb950',
      wickDownColor: '#f85149',
    })
    chartRef.current = { chart, series, extra: [] }
    // crosshair legend: O H L C ±% vol at the top-left, like a real terminal
    chart.subscribeCrosshairMove((param) => {
      const lg = legendRef.current
      if (!lg) return
      const b = param?.seriesData?.get(series)
      if (!b || b.open == null) { lg.style.display = 'none'; return }
      const up = b.close >= b.open
      const pct = ((b.close / b.open) - 1) * 100
      lg.style.display = 'block'
      lg.innerHTML =
        `<span style="color:#79828d">O</span> ${b.open.toFixed(2)} ` +
        `<span style="color:#79828d">H</span> ${b.high.toFixed(2)} ` +
        `<span style="color:#79828d">L</span> ${b.low.toFixed(2)} ` +
        `<span style="color:#79828d">C</span> <span style="color:${up ? '#3fb950' : '#f85149'}">${b.close.toFixed(2)} ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span>` +
        (b.volume ? ` <span style="color:#79828d">V</span> ${fmtVol(b.volume)}` : '')
    })
    return () => chart.remove()
  }, [intraday])

  useEffect(() => {
    const c = chartRef.current
    if (!c || !bars) return
    // oscillators run on window + warm-up prefix, then get trimmed back to the
    // window — otherwise RSI starts 14 bars in and MACD 34, which reads as the
    // indicator "not going back as far as the candles" (Jeff 2026-08-06)
    const warmed = warmedBars(bars, warmPad)
    c.series.setData(bars)
    c.chart.priceScale('right').applyOptions({ mode: ov.log ? 1 : 0 })
    c.extra.forEach((sr) => { try { c.chart.removeSeries(sr) } catch { /* gone */ } })
    c.extra = []
    for (const n of [20, 50, 200]) {
      if (!ov['sma' + n] || bars.length < n) continue
      const line = c.chart.addSeries(LineSeries, {
        color: SMA_COLORS[n], lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      })
      line.setData(trimToWindow(rollingSma(warmed, n), bars))
      c.extra.push(line)
    }
    if (ov.ema21 && bars.length >= 21) {
      const line = c.chart.addSeries(LineSeries, {
        color: '#e7ecf3', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
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
          crosshairMarkerVisible: false,
        })
        line.setData(data)
        c.extra.push(line)
      }
    }
    if (ov.vwap && intraday && bars.some((b) => b.volume)) {
      const line = c.chart.addSeries(LineSeries, {
        color: '#f59e0b', lineWidth: 1, lineStyle: 2,
        priceLineVisible: false, lastValueVisible: false,
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
    c.chart.timeScale().fitContent()
  }, [bars, warmPad, ov])

  return (
    <div>
      <div class="flex gap-1 px-1 pb-1.5 select-none flex-nowrap overflow-x-auto no-scrollbar">
        {[['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['sma200', 'SMA 200'], ['ema21', 'EMA 21'], ['bb', 'BB'], ...(intraday ? [['vwap', 'VWAP']] : []), ['rsi', 'RSI'], ['macd', 'MACD'], ['vol', 'VOL'], ['log', 'LOG']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider ${
              ov[k] ? 'border-accent-2/60 text-accent-2' : 'border-line text-muted hover:text-ink'
            }`}
            style={ov[k] && k.startsWith('sma') ? { color: SMA_COLORS[k.slice(3)], borderColor: SMA_COLORS[k.slice(3)] + '99' } : undefined}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => chartRef.current?.chart.timeScale().fitContent()}
          title={tl('reset full history')}
          class="font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider border-line text-muted hover:text-ink"
        >
          FIT
        </button>
      </div>
      <div class="relative">
        <div ref={legendRef} class="absolute left-2 top-1 z-10 font-mono text-[10.5px] text-ink pointer-events-none" style="display:none" />
        <div ref={el} class="h-[352px] w-full" />
      </div>
    </div>
  )
}

/** Analyst-consensus tone: conviction green → amber → red, matching the
 *  P&L grammar (strong buy is not the same signal as hold). */
export function ratingTone(key) {
  const k = String(key || '').toLowerCase().replace(/[\s_-]+/g, '_')
  if (k === 'strong_buy') return 'text-up font-semibold'
  if (k === 'buy' || k === 'overweight' || k === 'outperform') return 'text-up'
  if (k === 'hold' || k === 'neutral' || k === 'equal_weight') return 'text-accent'
  if (k === 'underperform' || k === 'underweight' || k === 'reduce') return 'text-down'
  if (k === 'sell' || k === 'strong_sell') return 'text-down font-semibold'
  return 'text-ink'
}

function Stat({ label, value, cls = 'text-ink' }) {
  return (
    <div class="flex justify-between gap-3 px-3 py-[4px] border-b border-line last:border-0">
      <span class="font-anth text-muted text-[11px]">{tl(label)}</span>
      <span class={`font-mono text-[11px] ${cls}`}>{value ?? '—'}</span>
    </div>
  )
}

function Technicals({ symbol }) {
  const [daily, setDaily] = useState(null)

  useEffect(() => {
    setDaily(null)
    fetchHistory(symbol, '1Y').then(setDaily).catch(() => setDaily({ bars: [] }))
  }, [symbol])

  const closes = daily?.bars?.map((b) => b.close) || []
  const price = closes[closes.length - 1]
  const r = rsi(closes, 14)
  const m = macd(closes)
  const bb = bollinger(closes, 20, 2)
  const smaCls = (n) => {
    const v = sma(closes, n)
    return v == null || price == null ? 'text-ink' : price >= v ? 'text-up' : 'text-down'
  }
  const rsiCls = r == null ? 'text-ink' : r >= 70 ? 'text-down' : r <= 30 ? 'text-up' : 'text-ink'

  // measured beta/corr vs the bench, from the same 1Y closes — Bloomberg HRA
  // in three rows (Jeff picked it from the 2026-08-05 sweep)
  const [bench, setBench] = useState(null)
  useEffect(() => {
    fetchHistory('QQQ', '1Y').then(setBench).catch(() => setBench({ bars: [] }))
  }, [])
  const reg = (() => {
    if (!daily?.bars?.length || !bench?.bars?.length) return null
    const shape = (bars) => bars.map((b) => ({ t: b.time, c: b.close }))
    return regressStats(alignedReturns(shape(daily.bars), shape(bench.bars)))
  })()

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Technicals — daily')}</h2>
      </header>
      <Stat label="SMA 20" value={fmtPrice(sma(closes, 20))} cls={smaCls(20)} />
      <Stat label="SMA 50" value={fmtPrice(sma(closes, 50))} cls={smaCls(50)} />
      <Stat label="SMA 200" value={fmtPrice(sma(closes, 200))} cls={smaCls(200)} />
      <Stat label="RSI 14" value={r == null ? null : r.toFixed(1)} cls={rsiCls} />
      <Stat
        label="MACD hist"
        value={m == null ? null : m.hist.toFixed(2)}
        cls={m == null ? 'text-ink' : m.hist >= 0 ? 'text-up' : 'text-down'}
      />
      <Stat label="Bollinger up" value={bb && fmtPrice(bb.upper)} />
      <Stat label="Bollinger mid" value={bb && fmtPrice(bb.mid)} />
      <Stat label="Bollinger low" value={bb && fmtPrice(bb.lower)} />
      <Stat label="Beta 1Y (QQQ)" value={reg && reg.beta.toFixed(2)}
        cls={reg ? (reg.beta > 1.2 ? 'text-accent' : 'text-ink') : 'text-ink'} />
      <Stat label="Corr QQQ" value={reg && reg.corr.toFixed(2)} />
      <Stat label="Up / down capt"
        value={reg && reg.upCapture != null && reg.downCapture != null
          ? `${Math.round(reg.upCapture)}% / ${Math.round(reg.downCapture)}%` : null}
        cls={reg && reg.upCapture > (reg.downCapture ?? 0) ? 'text-up' : 'text-ink'} />
    </section>
  )
}

function Fundamentals({ symbol }) {
  const [f, setF] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setF(null)
    setFailed(false)
    fetchFundamentals(symbol).then(setF).catch(() => setFailed(true))
  }, [symbol])

  // Indices/futures/crypto have no fundamentals — hide the card quietly.
  if (failed) return null

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2 flex items-baseline gap-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Fundamentals')}</h2>
        {f?.recommendationKey && (
          <span class={`font-mono text-[10px] uppercase ${ratingTone(f.recommendationKey)}`}>{f.recommendationKey.replace('_', ' ')}</span>
        )}
      </header>
      {!f && <div class="px-3 py-3 text-[11px] text-muted font-mono">{tt('common.loading')}</div>}
      {f && (
        <>
          <Stat label="Mkt cap" value={fmtBig(f.marketCap)} />
          <Stat label="P/E ttm / fwd" value={`${fmtRatio(f.trailingPE)} / ${fmtRatio(f.forwardPE)}`} />
          <Stat label="P/S ttm" value={fmtRatio(f.priceToSalesTrailing12Months)} />
          <Stat label="PEG" value={fmtRatio(f.pegRatio)} />
          <Stat label="EV/EBITDA" value={fmtRatio(f.enterpriseToEbitda)} />
          <Stat label="Gross margin" value={fmtFracPct(f.grossMargins)} />
          <Stat label="Op margin" value={fmtFracPct(f.operatingMargins)} />
          <Stat label="Net margin" value={fmtFracPct(f.profitMargins)} />
          <Stat label="ROE" value={fmtFracPct(f.returnOnEquity)} />
          <Stat label="Rev growth yoy" value={fmtFracPct(f.revenueGrowth)}
            cls={f.revenueGrowth == null ? 'text-ink' : f.revenueGrowth >= 0 ? 'text-up' : 'text-down'} />
          <Stat label="FCF ttm" value={fmtBig(f.freeCashflow)} />
          <Stat label="Div yield" value={fmtFracPct(f.dividendYield)} />
          <Stat label="Beta" value={fmtRatio(f.beta)} />
          <Stat label="Short % float" value={fmtFracPct(f.shortPercentOfFloat)} />
          <Stat label="Target (mean)" value={fmtPrice(f.targetMeanPrice)} />
        </>
      )}
    </section>
  )
}

function News({ symbol }) {
  const [items, setItems] = useState(null)

  useEffect(() => {
    setItems(null)
    fetchNews(symbol).then(setItems).catch(() => setItems([]))
  }, [symbol])

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('News')}</h2>
      </header>
      {items == null && <div class="px-3 py-3 text-[11px] text-muted font-mono">{tt('common.loading')}</div>}
      {items?.length === 0 && <div class="px-3 py-3 text-[11px] text-muted font-mono">{tl('no headlines')}</div>}
      {items?.map((n) => (
        <a
          key={n.link}
          href={n.link}
          target="_blank"
          rel="noopener noreferrer"
          class="block px-3 py-2 border-b border-line last:border-0 hover:bg-surface-3"
        >
          <div class="text-[12px] text-ink leading-snug">{n.title}</div>
          <div class="font-mono text-[10px] text-muted mt-0.5">
            {n.publisher}
            {n.time && ` · ${new Date(n.time).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}`}
          </div>
        </a>
      ))}
    </section>
  )
}

function OptionSide({ title, rows, spot, t, type }) {
  // Relative IV heat: hot = top quartile within the visible side. A static
  // threshold can't work across names — 40% IV is sleepy on some, wild on others.
  const ivs = rows.map((r) => r.iv).filter((v) => v != null).sort((a, b) => a - b)
  const ivHot = ivs.length >= 8 ? ivs[Math.floor(ivs.length * 0.75)] : null
  const maxOi = Math.max(...rows.map((r) => r.oi || 0), 1)
  // First strike at/above spot — the amber rule sits on this row's top edge.
  const crossIdx = spot != null ? rows.findIndex((r) => r.strike >= spot) : -1
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="text-[9px] text-muted uppercase tracking-wider bg-surface-2/60">
              <th class="px-2 py-1.5 text-right">{tl('Strike')}</th>
              {/* Last goes first on phones: bid/ask carry the live market. */}
              <th class="px-2 py-1.5 text-right max-sm:hidden">{tl('Last')}</th>
              <th class="px-2 py-1.5 text-right">{tl('Bid')}</th>
              <th class="px-2 py-1.5 text-right">{tl('Ask')}</th>
              <th class="px-2 py-1.5 text-right">{tl('IV')}</th>
              <th class="px-2 py-1.5 text-right">Δ</th>
              <th class="px-2 py-1.5 text-right">{tl('Vol')}</th>
              <th class="px-2 py-1.5 text-right">{tl('OI')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, i) => {
              const delta = bsDelta({ spot, strike: c.strike, t, iv: c.iv, type })
              const ad = delta != null ? Math.abs(delta) : null
              // Hierarchy by tradability: the 0.35–0.65 belly pops, deep ITM
              // reads solid, far OTM recedes.
              const deltaCls =
                ad == null ? 'text-muted'
                : ad >= 0.35 && ad <= 0.65 ? 'text-accent'
                : ad > 0.85 ? 'text-ink' : 'text-muted'
              const hotIv = ivHot != null && c.iv != null && c.iv >= ivHot
              const unusual = c.volume != null && c.oi > 0 && c.volume > c.oi
              const oiPct = Math.round(((c.oi || 0) / maxOi) * 100)
              return (
                <tr
                  key={c.strike}
                  class={`border-t ${i === crossIdx ? 'border-accent/60' : 'border-line'} ${c.itm ? 'bg-accent-soft/40' : ''} hover:bg-surface-3`}
                >
                  <td class="px-2 py-[3px] text-right font-bold text-ink">{fmtPrice(c.strike)}</td>
                  <td class="px-2 py-[3px] text-right text-ink max-sm:hidden">{c.last != null ? fmtPrice(c.last) : '—'}</td>
                  <td class="px-2 py-[3px] text-right text-up/90">{c.bid != null ? fmtPrice(c.bid) : '—'}</td>
                  <td class="px-2 py-[3px] text-right text-down/90">{c.ask != null ? fmtPrice(c.ask) : '—'}</td>
                  <td class={`px-2 py-[3px] text-right ${hotIv ? 'text-accent' : 'text-ink-2'}`}>
                    {c.iv != null ? `${(c.iv * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td class={`px-2 py-[3px] text-right ${deltaCls}`}>
                    {delta != null ? delta.toFixed(2) : '—'}
                  </td>
                  <td class={`px-2 py-[3px] text-right ${unusual ? 'text-accent font-bold' : 'text-muted'}`}>
                    {c.volume ?? '—'}
                  </td>
                  <td
                    class="px-2 py-[3px] text-right text-muted"
                    // Right-anchored depth fill scaled to the deepest OI in view;
                    // inline because a per-row percent can't be a Tailwind class.
                    // rgba is --color-accent at 0.10.
                    style={c.oi ? { background: `linear-gradient(to left, rgba(245,158,11,0.10) ${oiPct}%, transparent ${oiPct}%)` } : undefined}
                  >
                    {c.oi ?? '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function OptionsView({ symbol }) {
  const [expiration, setExpiration] = useState(null)
  const [chain, setChain] = useState(null)
  const [err, setErr] = useState(null)
  // `opt SYM 2026-09-18` from the command bar: hold the wanted date until the
  // chain arrives, then snap to the exact expiry or the first one after it.
  const [wantDate, setWantDate] = useState(() => consumePrefill('opt_expiry'))
  useEffect(() => {
    const onExpiry = (e) => { setWantDate(e.detail); sessionStorage.removeItem('opt_expiry') }
    window.addEventListener('tape:opt-expiry', onExpiry)
    return () => window.removeEventListener('tape:opt-expiry', onExpiry)
  }, [])

  useEffect(() => {
    setChain(null)
    setErr(null)
    fetchOptions(symbol, expiration)
      .then(setChain)
      .catch((e) => setErr(String(e.message || e)))
  }, [symbol, expiration])

  useEffect(() => {
    if (!chain || !wantDate || !chain.expirations?.length) return
    const iso = (x) => new Date(x * 1000).toISOString().slice(0, 10)
    const hit = chain.expirations.find((x) => iso(x) >= wantDate)
      || chain.expirations[chain.expirations.length - 1]
    setWantDate(null)
    if (hit !== chain.expiration) setExpiration(hit)
  }, [chain])

  if (err) {
    return (
      <div class="mx-1 px-3 py-2 bg-surface-1 border border-down/40 rounded-lg font-mono text-[11px] text-down">
        {tt('research.no_options_chain', { error: err })}
      </div>
    )
  }
  if (!chain) return <div class="px-2 font-mono text-[11px] text-muted">{tl('loading chain…')}</div>

  const t = Math.max((chain.expiration * 1000 - Date.now()) / (365 * 86_400_000), 1 / 365)
  // Show ±12 strikes around spot so the table stays scannable.
  const near = (rows) => {
    if (chain.spot == null) return rows
    const idx = rows.findIndex((r) => r.strike >= chain.spot)
    const lo = Math.max(0, (idx === -1 ? rows.length : idx) - 12)
    return rows.slice(lo, lo + 24)
  }

  return (
    <div class="min-w-0">
      <div class="flex items-center gap-2 px-1 pb-2 flex-wrap">
        <span class="font-mono text-[11px] text-muted">{tl('EXPIRY')}</span>
        <select
          value={chain.expiration ?? ''}
          onChange={(e) => setExpiration(Number(e.target.value))}
          class="bg-surface-1 border border-line-2 rounded-lg px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent"
        >
          {chain.expirations.map((x) => (
            <option key={x} value={x}>
              {new Date(x * 1000).toISOString().slice(0, 10)}
            </option>
          ))}
        </select>
        {chain.spot != null && (
          <span class="font-mono text-[11px] text-muted">
            {tt('research.options_note', { spot: fmtPrice(chain.spot) })}
          </span>
        )}
      </div>
      <div class="grid gap-2 xl:grid-cols-2">
        <OptionSide title={tl('Calls')} rows={near(chain.calls)} spot={chain.spot} t={t} type="call" />
        <OptionSide title={tl('Puts')} rows={near(chain.puts)} spot={chain.spot} t={t} type="put" />
      </div>
    </div>
  )
}

function IntradayView({ symbol }) {
  const el = useRef(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let chart = null
    setState('loading')
    fetchHistory(symbol, '1D')
      .then((h) => {
        if (!el.current) return
        setState(h.bars.length ? 'ok' : 'empty')
        if (!h.bars.length) return
        chart = createChart(el.current, {
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
          rightPriceScale: { borderColor: 'rgba(255,255,255,0.10)' },
          timeScale: boundedTimeScale(true),
        })
        const candles = chart.addSeries(CandlestickSeries, {
          upColor: '#3fb950', downColor: '#f85149',
          borderUpColor: '#3fb950', borderDownColor: '#f85149',
          wickUpColor: '#3fb950', wickDownColor: '#f85149',
        })
        candles.setData(h.bars)
        const vwap = chart.addSeries(LineSeries, {
          color: '#f59e0b', lineWidth: 1.5,
          priceLineVisible: false, lastValueVisible: true,
        })
        vwap.setData(vwapSeries(h.bars))
        chart.timeScale().fitContent()
      })
      .catch(() => setState('error'))
    return () => chart?.remove()
  }, [symbol])

  return (
    <section class="bg-surface-1 border border-line rounded-xl p-2 min-w-0">
      <div class="flex gap-3 px-2 pb-1 font-mono text-[11px]">
        <span class="text-muted">{tl('5-min bars · session')}</span>
        <span style={{ color: '#f59e0b' }}>— VWAP</span>
        {state === 'error' && <span class="text-down">{tl('no intraday data')}</span>}
      </div>
      <div ref={el} class="h-[420px] w-full" />
    </section>
  )
}

/** FA: statement tables (quarterly + annual), corporate actions, and the
 *  peer comp — the sweep's items 1/2/4 in one numbered tab. */
function StatementTable({ title, periods }) {
  const rows = statementRows(periods)
  if (!rows.length) return null
  const fmtCell = (kind, v) => v == null ? '—'
    : kind === 'money' ? fmtBig(v)
    : kind === 'pct' ? `${v.toFixed(1)}%`
    : v >= 100 ? v.toFixed(0) : v.toFixed(2)
  const short = (end) => end ? `${end.slice(2, 4)}'${end.slice(5, 7)}` : '—'
  return (
    <SectionCard title={title}>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[11px] whitespace-nowrap">
          <thead>
            <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
              <th class="px-3 py-2 text-left"></th>
              {periods.map((per) => (
                <th key={per.ts} class="px-2 py-2 text-right">{short(per.end)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} class="border-t border-line hover:bg-surface-3">
                <td class="px-3 py-[4px] text-muted">{tl(row.label)}</td>
                {row.cells.map((cell, i) => (
                  <td key={i} class="px-2 py-[4px] text-right">
                    <span class="text-ink">{fmtCell(row.kind, cell.v)}</span>
                    {cell.growth != null && (
                      <span class={`ml-1.5 text-[9.5px] ${cell.growth >= 0 ? 'text-up' : 'text-down'}`}>
                        {cell.growth >= 0 ? '+' : ''}{Math.round(cell.growth)}%
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  )
}

function PeerComp({ symbol }) {
  const bucket = BUCKETS.find((b) => b.symbols.includes(symbol))
  const peers = (bucket?.symbols || []).slice(0, 14)
  const [rows, setRows] = useState(null)
  useEffect(() => {
    let dead = false
    setRows(null)
    if (!peers.length) { setRows([]); return }
    Promise.all(peers.map((sym) =>
      Promise.all([fetchFundamentals(sym).catch(() => null), fetchHistory(sym, '1Y').catch(() => null)])
        .then(([f, h]) => {
          const closes = h?.bars?.map((b) => b.close) || []
          const last = closes[closes.length - 1]
          const high = closes.length ? Math.max(...closes) : null
          return { sym, f, last, offHigh: last && high ? ((last / high) - 1) * 100 : null }
        })))
      .then((out) => !dead && setRows(out.filter((r) => r.f)))
    return () => { dead = true }
  }, [symbol])
  if (!bucket) return null
  return (
    <SectionCard title={`${tl('Relative value')} · ${tl(bucket.name)}`}>
      {rows === null ? (
        <div class="px-3 py-2 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
      ) : (
        <div class="overflow-x-auto">
          <table class="w-full border-collapse font-mono text-[11px] whitespace-nowrap">
            <thead>
              <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                <th class="px-3 py-2 text-left">{tl('Ticker')}</th>
                <th class="px-2 py-2 text-right">P/E fwd</th>
                <th class="px-2 py-2 text-right">EV/EBITDA</th>
                <th class="px-2 py-2 text-right">PEG</th>
                <th class="px-2 py-2 text-right">P/S</th>
                <th class="px-2 py-2 text-right">{tl('Gross margin')}</th>
                <th class="px-2 py-2 text-right">{tl('Rev growth')}</th>
                <th class="px-3 py-2 text-right">%{tl('off high')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sym, f, offHigh }) => (
                <tr key={sym}
                  class={`border-t border-line ${sym === symbol ? 'bg-accent-soft' : 'hover:bg-surface-3'}`}>
                  <td class="px-3 py-[4px]">
                    <a href={`#/research/${sym.toLowerCase()}/financials`}
                       class={`hover:text-accent hover:no-underline ${sym === symbol ? 'text-accent font-bold' : 'text-ink'}`}>{sym}</a>
                  </td>
                  {/* ADR/foreign listings sometimes mix reporting currency into
                      these ratios (ASML EV/EBITDA "2654") — a screen full of
                      garbage beats a dash, so absurd values render as none */}
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.forwardPE != null && f.forwardPE < 500 ? fmtRatio(f.forwardPE) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.enterpriseToEbitda != null && f.enterpriseToEbitda < 500 ? fmtRatio(f.enterpriseToEbitda) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.pegRatio != null ? fmtRatio(f.pegRatio) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.priceToSalesTrailing12Months != null ? fmtRatio(f.priceToSalesTrailing12Months) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{f.grossMargins != null ? fmtFracPct(f.grossMargins) : '—'}</td>
                  <td class={`px-2 py-[4px] text-right ${(f.revenueGrowth ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>{f.revenueGrowth != null ? fmtFracPct(f.revenueGrowth) : '—'}</td>
                  <td class={`px-3 py-[4px] text-right ${offHigh != null && offHigh <= -15 ? 'text-down' : 'text-ink-2'}`}>{offHigh != null ? `${Math.round(offHigh)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  )
}

function CorporateActions({ symbol }) {
  const [divs, setDivs] = useState(null)
  const [splits, setSplits] = useState(null)
  useEffect(() => {
    setDivs(null); setSplits(null)
    fetchDivHistory(symbol).then(setDivs).catch(() => setDivs([]))
    fetchSplits(symbol).then(setSplits).catch(() => setSplits([]))
  }, [symbol])
  if (divs === null || splits === null) return null
  if (!divs.length && !splits.length) return null
  return (
    <SectionCard title={tl('Corporate actions')}>
      <div class="p-3 pt-2 font-mono text-[11px] flex flex-col gap-1">
        {splits.map((sp) => (
          <div key={sp.date} class="flex gap-3">
            <span class="text-muted w-20">{new Date(sp.date * 1000).toISOString().slice(0, 10)}</span>
            <span class="text-accent">{tl('split')} {sp.ratio}</span>
          </div>
        ))}
        {divs.slice(0, 8).map((d) => (
          <div key={d.date} class="flex gap-3">
            <span class="text-muted w-20">{new Date(d.date * 1000).toISOString().slice(0, 10)}</span>
            <span class="text-up">{tl('dividend')} ${+d.amount.toFixed(4)}</span>
          </div>
        ))}
        {divs.length > 8 && <span class="text-muted text-[10px]">… {divs.length - 8} {tl('more in the last 5y')}</span>}
      </div>
    </SectionCard>
  )
}

function FinancialsView({ symbol }) {
  const [fa, setFa] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    setFa(null); setErr('')
    fetchFinancials(symbol).then(setFa).catch((e) => setErr(String(e.message || e)))
  }, [symbol])
  if (err) return <div class="px-1 font-mono text-[11px] text-down">{err}</div>
  if (fa === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      <StatementTable title={`${tl('Quarterly')} · ${symbol}`} periods={fa.quarterly} />
      <StatementTable title={`${tl('Annual')} · ${symbol}`} periods={fa.annual} />
      <div class="grid gap-3 xl:grid-cols-[1fr_320px] items-start">
        <PeerComp symbol={symbol} />
        <CorporateActions symbol={symbol} />
      </div>
    </div>
  )
}

function InsiderView({ symbol }) {
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setRows(null)
    setFailed(false)
    fetchInsider(symbol).then(setRows).catch(() => setFailed(true))
  }, [symbol])

  if (failed) {
    return (
      <div class="px-1 font-mono text-[11px] text-muted">
        {tt('research.no_insider', { sym: symbol })}
      </div>
    )
  }
  if (!rows) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto max-w-4xl">
      <table class="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
            <th class="px-3 py-2 text-left">{tl('Date')}</th>
            <th class="px-2 py-2 text-left">{tl('Name')}</th>
            <th class="px-2 py-2 text-left">{tl('Role')}</th>
            <th class="px-2 py-2 text-left">{tl('Transaction')}</th>
            <th class="px-2 py-2 text-right">{tl('Shares')}</th>
            <th class="px-3 py-2 text-right">{tl('Value')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t, i) => {
            const sale = /sale/i.test(t.text || '')
            const buy = /purchase|buy/i.test(t.text || '')
            return (
              <tr key={i} class="border-t border-line hover:bg-surface-3">
                <td class="px-3 py-[4px] text-ink-2 whitespace-nowrap">
                  {t.date ? new Date(t.date).toISOString().slice(0, 10) : '—'}
                </td>
                <td class="px-2 py-[4px] text-ink whitespace-nowrap">{t.name}</td>
                <td class="px-2 py-[4px] text-muted whitespace-nowrap max-w-40 truncate">{t.relation}</td>
                <td class={`px-2 py-[4px] max-w-72 truncate ${sale ? 'text-down' : buy ? 'text-up' : 'text-ink-2'}`}>
                  {t.text || '—'}
                </td>
                <td class="px-2 py-[4px] text-right text-ink-2">{fmtVol(t.shares)}</td>
                <td class="px-3 py-[4px] text-right text-ink">{t.value != null ? fmtBig(t.value) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function SummaryStat({ label, value, tone }) {
  return (
    <div class="flex flex-col gap-0.5 px-3 py-2">
      <span class="text-[9px] text-muted uppercase tracking-wider">{label}</span>
      <span class={`font-mono text-[13px] ${tone || 'text-ink'}`}>{value}</span>
    </div>
  )
}

function EarningsView({ symbol }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let dead = false
    setData(null)
    setFailed(false)
    fetchEarningsImpact(symbol)
      .then((d) => { if (!dead) setData(d) })
      .catch(() => { if (!dead) setFailed(true) })
    return () => { dead = true }
  }, [symbol])

  if (failed) {
    return (
      <div class="px-1 font-mono text-[11px] text-muted">
        {tt('research.no_earnings', { sym: symbol })}
      </div>
    )
  }
  if (!data) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!data.events.length) {
    return <div class="px-1 font-mono text-[11px] text-muted">no reported quarters for {symbol}</div>
  }

  const s = data.summary
  const pctTone = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')
  const rows = reconcileQuarters(data.events)
  const anyPeers = rows.some((e) => e.peers?.length)

  return (
    <div class="flex flex-col gap-3">
      <section class="bg-surface-1 border border-line rounded-xl flex flex-wrap divide-x divide-line">
        <SummaryStat
          label={tl('Beat rate')}
          value={s.beatRate != null ? `${Math.round(s.beatRate * 100)}% (${s.beats}/${s.total})` : '—'}
        />
        <SummaryStat label={tl('Beat streak')} value={`${s.beatStreak}q`} />
        <SummaryStat
          label={tl('Avg surprise')}
          value={s.avgSurprise != null ? fmtPct(s.avgSurprise * 100) : '—'}
          tone={pctTone(s.avgSurprise)}
        />
        <SummaryStat
          label={tl('Avg reaction')}
          value={s.avgMove != null ? fmtPct(s.avgMove) : '—'}
          tone={pctTone(s.avgMove)}
        />
      </section>

      <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
              <th class="px-3 py-2 text-left">{tl('Quarter')}</th>
              <th class="px-2 py-2 text-left">{tl('Reported')}</th>
              <th class="px-2 py-2 text-right">{tl('EPS est')}</th>
              <th class="px-2 py-2 text-right">{tl('EPS act')}</th>
              <th class="px-2 py-2 text-right">{tl('Surprise')}</th>
              <th class="px-2 py-2 text-right">{tl('Reaction')}</th>
              {anyPeers && <th class="px-3 py-2 text-left">{tl('Peers')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={`${e.quarter ?? ''}-${e.report ?? ''}`} class="border-t border-line hover:bg-surface-3">
                <td class={`px-3 py-[3px] whitespace-nowrap ${e.quarterInferred ? 'text-muted italic' : 'text-ink-2'}`}
                    title={e.quarterInferred ? 'fiscal quarter inferred from the report date' : undefined}>
                  {e.quarter ? new Date(e.quarter).toISOString().slice(0, 10) : '—'}
                </td>
                <td class={`px-2 py-[3px] whitespace-nowrap ${e.reportInferred ? 'text-muted italic' : 'text-muted'}`}
                    title={e.reportInferred ? 'estimated from this name’s typical reporting lag' : undefined}>
                  {e.report
                    ? `${e.reportInferred ? '~' : ''}${new Date(e.report).toISOString().slice(0, 10)}`
                    : '—'}
                </td>
                <td class="px-2 py-[3px] text-right text-ink-2">{e.epsEstimate != null ? e.epsEstimate.toFixed(2) : '—'}</td>
                <td class="px-2 py-[3px] text-right text-ink">{e.epsActual.toFixed(2)}</td>
                <td class={`px-2 py-[3px] text-right ${pctTone(e.surprisePct)}`}>
                  {e.surprisePct != null ? fmtPct(e.surprisePct * 100) : '—'}
                </td>
                <td class={`px-2 py-[3px] text-right ${pctTone(e.priceMove)}`}>
                  {e.priceMove != null ? fmtPct(e.priceMove) : '—'}
                </td>
                {anyPeers && (
                  <td class="px-3 py-[3px] whitespace-nowrap">
                    {e.peers?.length
                      ? e.peers.map((p) => (
                          <span key={p.sym} class="mr-2">
                            <span class="text-muted">{p.sym}</span>{' '}
                            <span class={pctTone(p.move)}>{fmtPct(p.move)}</span>
                          </span>
                        ))
                      : ''}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <div class="px-3 py-1.5 border-t border-line text-[9px] text-muted">
          {tt('earn.note')}
        </div>
      </section>
    </div>
  )
}

const GRADE_TONE = (g) => {
  const s = (g || '').toLowerCase()
  if (/buy|overweight|outperform|positive|accumulate/.test(s)) return 'text-up'
  if (/sell|underweight|underperform|negative|reduce/.test(s)) return 'text-down'
  return 'text-ink-2'
}

function AnalystsView({ symbol }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  const live = useQuotes([symbol])
  const price = live[symbol]?.quote?.price

  useEffect(() => {
    let dead = false
    setData(null)
    setFailed(false)
    fetchAnalysts(symbol)
      .then((d) => { if (!dead) setData(d) })
      .catch(() => { if (!dead) setFailed(true) })
    return () => { dead = true }
  }, [symbol])

  if (failed) {
    return <div class="px-1 font-mono text-[11px] text-muted">no analyst coverage for {symbol}</div>
  }
  if (!data) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>

  const t9 = data.trend
  const total = t9 ? t9.strongBuy + t9.buy + t9.hold + t9.sell + t9.strongSell : 0
  const seg = (n, cls) =>
    n > 0 && <div class={`${cls} h-full`} style={{ width: `${(n / total) * 100}%` }} title={n} />
  const tg = data.targets

  return (
    <div class="grid gap-3 items-start xl:grid-cols-[400px_minmax(0,1fr)]">
      <div class="flex flex-col gap-3 min-w-0">
      {t9 && total > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
            <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
              {tl('Rec trend')} · {total} {tl('Analysts').toLowerCase()}
            </h2>
          </header>
          <div class="p-4 pt-3">
          <div class="flex h-3 rounded overflow-hidden">
            {seg(t9.strongBuy, 'bg-up')}
            {seg(t9.buy, 'bg-up/50')}
            {seg(t9.hold, 'bg-accent/60')}
            {seg(t9.sell, 'bg-down/50')}
            {seg(t9.strongSell, 'bg-down')}
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 pt-2 font-mono text-[10px]">
            <span class="text-up">{tl('Strong buy')} {t9.strongBuy}</span>
            <span class="text-up/80">{tl('Buy')} {t9.buy}</span>
            <span class="text-accent">{tl('Hold')} {t9.hold}</span>
            <span class="text-down/80">{tl('Sell')} {t9.sell}</span>
            <span class="text-down">{tl('Strong sell')} {t9.strongSell}</span>
          </div>
          </div>
        </section>
      )}

      {tg.mean != null && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden font-mono text-[12px]">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
            <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
              {tl('Price targets')}{tg.analysts != null && ` · ${tg.analysts}`}
            </h2>
          </header>
          <div class="p-4 pt-3">
          <div class="flex flex-wrap gap-x-6 gap-y-1">
            <span><span class="text-muted">{tl('Low')}</span> <span class="text-ink-2">{fmtPrice(tg.low)}</span></span>
            <span><span class="text-muted">{tl('Mean')}</span> <span class="text-ink">{fmtPrice(tg.mean)}</span></span>
            <span><span class="text-muted">{tl('High')}</span> <span class="text-ink-2">{fmtPrice(tg.high)}</span></span>
            {price != null && (
              <span>
                <span class="text-muted">{tl('Current')}</span>{' '}
                <span class={price <= tg.mean ? 'text-up' : 'text-down'}>
                  {fmtPrice(price)} ({fmtPct(((tg.mean - price) / price) * 100)} → {tl('Mean')})
                </span>
              </span>
            )}
          </div>
          </div>
        </section>
      )}

      </div>
      {data.history.length > 0 && (
        <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto min-w-0">
          <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
            <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Recent rating changes')}</h2>
          </header>
          <table class="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                <th class="px-3 py-2 text-left">{tl('Date')}</th>
                <th class="px-2 py-2 text-left">{tl('Firm')}</th>
                <th class="px-2 py-2 text-left">{tl('From')}</th>
                <th class="w-6 px-1 py-2"></th>
                <th class="px-2 py-2 text-left">{tl('To')}</th>
                <th class="px-2 py-2 text-right">{tl('Past PT')}</th>
                <th class="w-8 px-1 py-2"></th>
                <th class="px-3 py-2 text-right">{tl('New PT')}</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((h, i) => (
                <tr key={i} class="border-t border-line hover:bg-surface-3">
                  <td class="px-3 py-[4px] text-muted whitespace-nowrap">
                    {h.date ? new Date(h.date).toISOString().slice(0, 10) : '—'}
                  </td>
                  <td class="px-2 py-[4px] text-ink whitespace-nowrap max-w-44 truncate">{h.firm}</td>
                  <td class="px-2 py-[4px] whitespace-nowrap text-muted">{h.from || '—'}</td>
                  <td class="w-6 px-1 py-[4px] text-center">
                    {h.action === 'up' ? <span class="text-up">▲</span>
                      : h.action === 'down' ? <span class="text-down">▼</span>
                      : ''}
                  </td>
                  <td class={`px-2 py-[4px] whitespace-nowrap font-medium ${GRADE_TONE(h.to)}`}>{h.to || '—'}</td>
                  <td class="px-2 py-[4px] text-right text-muted whitespace-nowrap">
                    {h.priorPt != null ? fmtPrice(h.priorPt) : '—'}
                  </td>
                  <td class="w-8 px-1 py-[4px] text-center text-muted">
                    {h.pt != null && h.priorPt != null ? '→' : ''}
                  </td>
                  <td class={`px-3 py-[4px] text-right whitespace-nowrap ${
                    h.pt != null && h.priorPt != null
                      ? (h.pt >= h.priorPt ? 'text-up' : 'text-down')
                      : 'text-ink-2'
                  }`}>
                    {h.pt != null ? fmtPrice(h.pt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}

function SectionCard({ title, actions, children }) {
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2 flex items-center gap-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
        {actions && <div class="ml-auto flex items-center gap-1 overflow-x-auto no-scrollbar">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

function useFetched(symbol, fetcher) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let dead = false
    setData(null)
    setFailed(false)
    fetcher(symbol)
      .then((d) => { if (!dead) setData(d) })
      .catch(() => { if (!dead) setFailed(true) })
    return () => { dead = true }
  }, [symbol])
  return [data, failed]
}

/** Bloomberg OWN: insiders and institutions on one page. */
function OwnershipView({ symbol }) {
  return (
    <div class="flex flex-col gap-3">
      <HoldersView symbol={symbol} />
      <InsiderView symbol={symbol} />
    </div>
  )
}

function DesSpark({ symbol }) {
  const [hist, setHist] = useState(null)
  useEffect(() => {
    setHist(null)
    fetchHistory(symbol, '1Y').then(setHist).catch(() => setHist({ bars: [] }))
  }, [symbol])
  const closes = hist?.bars?.map((b) => b.close) || []
  if (!closes.length) return <div class="h-[92px]" />
  const lo = Math.min(...closes)
  const hi = Math.max(...closes)
  const W = 200
  const H = 72
  const x = (i) => (i / (closes.length - 1)) * W
  const y = (v) => H - ((v - lo) / (hi - lo || 1)) * (H - 4) - 2
  const path = closes.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const up = closes[closes.length - 1] >= closes[0]
  const tone = up ? 'var(--color-up)' : 'var(--color-down)'
  return (
    <div class="flex flex-col gap-0.5">
      <div class="flex justify-between font-mono text-[8.5px] text-muted uppercase tracking-wider">
        <span>1Y</span><span>{fmtPriceBare(lo)} – {fmtPriceBare(hi)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} class="w-full h-[72px]" preserveAspectRatio="none">
        <path d={`${path} L${W},${H} L0,${H} Z`} fill={tone} opacity="0.08" />
        <path d={path} fill="none" stroke={tone} stroke-width="1.4" />
      </svg>
    </div>
  )
}

function ProfileView({ symbol }) {
  const [p, failed] = useFetched(symbol, fetchProfile)
  const [f, setF] = useState(null)
  useEffect(() => {
    setF(null)
    fetchFundamentals(symbol).then(setF).catch(() => {})
  }, [symbol])
  if (failed || (p === null && failed)) {
    return <div class="px-1 font-mono text-[11px] text-muted">no profile for {symbol}</div>
  }
  if (p === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!p) return <div class="px-1 font-mono text-[11px] text-muted">no profile for {symbol}</div>
  return (
    <div class="max-w-5xl">
      {/* one DES card, bloomberg-style: prose column + facts rail beside it —
          two stacked cards left a dead column right of the text
          (Jeff 2026-08-05) */}
      <SectionCard title={tl('Description')}>
        <div class="p-4 pt-3 flex gap-6 max-md:flex-col">
          <div class="flex-1 min-w-0 flex flex-col gap-4 pl-1.5">
            {p.summary && (
              <p class="font-anth text-[12.5px] leading-[1.85] text-ink-2">{p.summary}</p>
            )}
            {/* management rides under the prose — a two-line description used
                to leave the whole column hollow (Jeff 2026-08-05) */}
            {p.officers.length > 0 && (
              <div>
                <h3 class="font-anth font-bold text-[10px] tracking-wider text-muted uppercase pb-1">{tl('Officers')}</h3>
                <table class="w-full border-collapse font-mono text-[11.5px]">
                  <tbody>
                    {p.officers.map((o) => (
                      <tr key={o.name} class="border-t border-line first:border-0">
                        <td class="py-[5px] pr-2 text-ink whitespace-nowrap">{o.name}</td>
                        <td class="px-2 py-[5px] text-muted">{o.title}</td>
                        <td class="py-[5px] pl-2 text-right text-ink-2 whitespace-nowrap">{o.pay != null ? fmtBig(o.pay) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div class="shrink-0 w-60 max-md:w-full flex flex-col gap-3 border-l border-line pl-4 max-md:border-l-0 max-md:pl-0 max-md:pt-3 max-md:border-t">
            <DesSpark symbol={symbol} />
            <dl class="font-mono text-[11.5px] flex flex-col gap-2">
              {[
                [tl('Sector'), p.sector, 'text-ink'],
                [tl('Industry'), p.industry, 'text-ink-2'],
                [tl('Mkt cap'), f?.marketCap != null ? fmtBig(f.marketCap) : null, 'text-ink'],
                [tl('Employees'), p.employees ? p.employees.toLocaleString() : null, 'text-ink-2'],
              ].map(([label, value, toneCls]) => (
                <div key={label} class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">{label}</dt>
                  <dd class={toneCls}>{value || '—'}</dd>
                </div>
              ))}
              {(p.address || p.city) && (
                <div class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">{tl('HQ')}</dt>
                  {p.address && <dd class="text-ink-2">{p.address}</dd>}
                  <dd class="text-ink-2">{[p.city, p.state].filter(Boolean).join(', ')}{p.zip ? ` ${p.zip}` : ''}</dd>
                  {/* country reads as its own line, not run into the city */}
                  {p.country && <dd class="text-ink-2">{p.country}</dd>}
                </div>
              )}
              {p.phone && (
                <div class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">{tl('Phone')}</dt>
                  <dd class="text-ink-2">{p.phone}</dd>
                </div>
              )}
              {p.website && (
                <div class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">{tl('Website')}</dt>
                  <dd><a class="text-accent hover:underline" href={p.website} target="_blank" rel="noopener">{p.website.replace(/^https?:\/\//, '')}</a></dd>
                </div>
              )}
              {p.irWebsite && (
                <div class="flex flex-col">
                  <dt class="text-[9px] uppercase tracking-wider text-muted">IR</dt>
                  <dd><a class="text-accent hover:underline" href={p.irWebsite} target="_blank" rel="noopener">{p.irWebsite.replace(/^https?:\/\//, '').slice(0, 34)}</a></dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

function HoldersView({ symbol }) {
  const [h, failed] = useFetched(symbol, fetchHolders)
  if (failed) return <div class="px-1 font-mono text-[11px] text-muted">no ownership data for {symbol}</div>
  if (h === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!h) return <div class="px-1 font-mono text-[11px] text-muted">no ownership data for {symbol}</div>
  return (
    <div class="flex flex-col gap-3">
      <SectionCard title={tl('Ownership')}>
        <div class="p-4 pt-3 font-mono text-[12px] flex flex-wrap gap-x-6 gap-y-1">
          <span><span class="text-muted">{tl('Institutions')}</span> <span class="text-ink">{h.institutionsPct != null ? fmtFracPct(h.institutionsPct) : '—'}</span>{h.institutionsCount != null && <span class="text-muted"> · {h.institutionsCount.toLocaleString()} {tl('holders')}</span>}</span>
          <span><span class="text-muted">{tl('Insiders')}</span> <span class="text-ink-2">{h.insidersPct != null ? fmtFracPct(h.insidersPct) : '—'}</span></span>
        </div>
      </SectionCard>
      {h.top.length > 0 && (
        <SectionCard title={tl('Top institutional holders')}>
          <table class="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                <th class="px-3 py-2 text-left">{tl('Holder')}</th>
                <th class="px-2 py-2 text-right">{tl('% held')}</th>
                <th class="px-2 py-2 text-right">{tl('Shares')}</th>
                <th class="px-2 py-2 text-right">{tl('Value')}</th>
                <th class="px-3 py-2 text-right">{tl('Reported')}</th>
              </tr>
            </thead>
            <tbody>
              {h.top.map((o) => (
                <tr key={o.org} class="border-t border-line hover:bg-surface-3">
                  <td class="px-3 py-[4px] text-ink whitespace-nowrap max-w-56 truncate">{o.org}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{o.pctHeld != null ? fmtFracPct(o.pctHeld) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{o.position != null ? fmtVol(o.position) : '—'}</td>
                  <td class="px-2 py-[4px] text-right text-ink-2">{o.value != null ? fmtBig(o.value) : '—'}</td>
                  <td class="px-3 py-[4px] text-right text-muted whitespace-nowrap">{o.reportDate ? new Date(o.reportDate).toISOString().slice(0, 10) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
    </div>
  )
}

const FORM_TONE = (form) =>
  /^(10-K|10-Q|8-K)/.test(form) ? 'text-accent font-medium'
    : /^(4|SC 13|13F)/.test(form) ? 'text-ink' : 'text-ink-2'

function FilingsView({ symbol }) {
  const [d, failed] = useFetched(symbol, fetchFilings)
  if (failed) return <div class="px-1 font-mono text-[11px] text-muted">no SEC filings for {symbol}</div>
  if (d === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!d.filings.length) return <div class="px-1 font-mono text-[11px] text-muted">no SEC filings for {symbol}</div>
  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      <SectionCard title={tl('SEC filings')}>
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
              <th class="px-3 py-2 text-left">{tl('Filed')}</th>
              <th class="px-2 py-2 text-left">{tl('Form')}</th>
              <th class="px-3 py-2 text-left">{tl('Title')}</th>
            </tr>
          </thead>
          <tbody>
            {d.filings.map((f, i) => (
              <tr key={i} class="border-t border-line hover:bg-surface-3">
                <td class="px-3 py-[4px] text-muted whitespace-nowrap">{f.date}</td>
                <td class={`px-2 py-[4px] whitespace-nowrap ${FORM_TONE(f.form)}`}>{f.form}</td>
                <td class="px-3 py-[4px]">
                  {f.url
                    ? <a class="text-ink-2 hover:text-accent" href={f.url} target="_blank" rel="noopener">{f.title || f.form}</a>
                    : <span class="text-ink-2">{f.title || '—'}</span>}
                  {f.exhibits.slice(0, 3).map((x) => (
                    <a key={x.url} class="ml-2 text-[10px] text-muted hover:text-accent" href={x.url} target="_blank" rel="noopener">{x.type}</a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  )
}

function NewsReadBody({ ev, base }) {
  const [state, setState] = useState({ status: 'loading', paras: [] })
  useEffect(() => {
    let dead = false
    if (!base || !ev.url) { setState({ status: 'empty', paras: [] }); return }
    fetch(`${base.replace(/\/$/, '')}/api/read?id=${ev.id}&fast=1`,
      { signal: AbortSignal.timeout(20_000) })
      .then((r) => r.json())
      .then((out) => {
        if (dead) return
        const text = out.ok ? (out.text || out.summary || '') : ''
        const paras = String(text).split(/\n{2,}/).map((x) => x.trim()).filter(Boolean)
        setState({ status: paras.length ? 'ok' : 'empty', paras })
      })
      .catch(() => !dead && setState({ status: 'empty', paras: [] }))
    return () => { dead = true }
  }, [ev.id])
  if (state.status === 'loading') {
    return <p class="text-[10.5px] font-mono text-muted animate-pulse py-1.5">{tl('pulling the story…')}</p>
  }
  if (state.status === 'empty') {
    return (
      <p class="text-[10.5px] font-mono text-muted py-1.5">
        {tl("source wouldn't give up its text —")}{' '}
        <a href={ev.url} target="_blank" rel="noopener"
           class="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
          {tl('open the page ↗')}
        </a>
      </p>
    )
  }
  return (
    <div class="flex flex-col gap-1.5 py-2 max-w-[74ch] mx-auto">
      {state.paras.slice(0, 12).map((para, i) => (
        <p key={i} class="text-[11.5px] leading-relaxed text-ink-2 font-anth">{para}</p>
      ))}
      {state.paras.length > 12 && (
        <p class="text-[10px] font-mono text-muted">
          …{' '}
          <a href={ev.url} target="_blank" rel="noopener"
             class="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
            {tl('full text at the source ↗')}
          </a>
        </p>
      )}
    </div>
  )
}

function SymbolNewsView({ symbol, name }) {
  const [openId, setOpenId] = useState(null)
  const [wireType, setWireType] = useState('all')
  const [yahoo, setYahoo] = useState(null)
  const [wireRows, setWireRows] = useState(null)
  const base = wireUrl()
  useEffect(() => {
    let dead = false
    setYahoo(null)
    fetchNews(symbol).then((n) => !dead && setYahoo(n)).catch(() => !dead && setYahoo([]))
    return () => { dead = true }
  }, [symbol])
  useEffect(() => {
    let dead = false
    setWireRows(null)
    if (!base) { setWireRows([]); return }
    const root = base.replace(/\/$/, '')
    const queries = [
      fetch(`${root}/api/events?symbols=${encodeURIComponent(symbol)}&limit=40&newest=1`,
            { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null),
      fetch(`${root}/api/search?q=${encodeURIComponent(symbol)}`,
            { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null),
    ]
    // untagged stories talk about the company, not the ticker
    const word = (name || '').split(/[\s,]+/)[0]
    if (word && word.toLowerCase() !== symbol.toLowerCase()) {
      queries.push(fetch(`${root}/api/search?q=${encodeURIComponent(word)}`,
                         { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null))
    }
    Promise.all(queries).then((outs) => {
      if (dead) return
      const seen = new Set()
      const rows = []
      for (const out of outs) {
        for (const e of out?.events || []) {
          if (seen.has(e.id)) continue
          seen.add(e.id)
          if (e.type === 'brief' || e.type === 'transcript_chunk') continue
          rows.push(e)
        }
      }
      rows.sort((a, b) => (b.ts_event || 0) - (a.ts_event || 0))
      setWireRows(rows.slice(0, 40))
    })
    return () => { dead = true }
  }, [symbol, base, name])

  const CODE = { earnings_release: 'ERN', filing: 'FIL', headline: 'NWS',
    macro_print: 'ECO', price_move: 'PX', digest: 'DIG' }
  // simple per-type filters ride the card's title row (Jeff 2026-08-06)
  const wireTypes = [...new Set((wireRows || []).map((e) => e.type).filter(Boolean))]
  const shownWire = wireType === 'all' ? wireRows : (wireRows || []).filter((e) => e.type === wireType)
  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      {base && (
        <SectionCard title={`FRAGWIRE · ${symbol}`}
          actions={wireTypes.length > 1 && (
            <>
              {['all', ...wireTypes].map((t) => (
                <button key={t}
                  onClick={() => setWireType(t === wireType ? 'all' : t)}
                  class={`font-mono text-[9px] px-1.5 py-px rounded border tracking-wider shrink-0 ${
                    wireType === t
                      ? 'border-accent-2 text-accent-2 bg-accent-2-soft'
                      : 'border-line-2 text-muted hover:text-ink'
                  }`}>
                  {t === 'all' ? tl('All') : (CODE[t] || t.slice(0, 3).toUpperCase())}
                </button>
              ))}
            </>
          )}>
          {wireRows === null ? (
            <div class="px-3 py-2 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
          ) : !wireRows.length ? (
            <div class="px-3 py-2 font-mono text-[11px] text-muted">{tt('research.nothing_on_wire', { symbol })}</div>
          ) : (
            <div class="font-mono text-[11.5px]">
              {!shownWire.length && (
                <div class="px-3 py-2 text-muted">{tt('research.nothing_on_wire', { symbol })}</div>
              )}
              {shownWire.map((e) => (
                <div key={e.id}
                  class={`border-t border-line first:border-0 cursor-pointer ${openId === e.id ? 'bg-surface-2/60' : 'hover:bg-surface-3'}`}
                  onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                  <div class="grid grid-cols-[86px_36px_1fr_auto] gap-x-2.5 items-baseline px-3 py-[3px]">
                    <span class="text-muted whitespace-nowrap">
                      {new Date(e.ts_event * 1000).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
                      {' '}
                      {new Date(e.ts_event * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
                    </span>
                    <span class={`text-[10px] tracking-wider ${e.type === 'earnings_release' || e.type === 'price_move' ? 'text-accent font-semibold' : 'text-muted'}`}>
                      {CODE[e.type] || (e.type || '').slice(0, 3).toUpperCase()}
                    </span>
                    <span class={`truncate ${openId === e.id ? 'text-ink' : 'text-ink-2'}`}>{e.headline}</span>
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noopener" onClick={(ev2) => ev2.stopPropagation()}
                         class="text-muted hover:text-accent text-[10px] border border-line-2 rounded px-1 leading-[1.5]">↗</a>
                    )}
                  </div>
                  {openId === e.id && (
                    <div class="px-3 pb-1.5">
                      <h3 class="font-anth font-semibold text-[14px] leading-snug text-ink pt-1 pb-0.5 max-w-[74ch] mx-auto">{e.headline}</h3>
                      {e.body
                        ? <p class="text-[11.5px] leading-relaxed text-ink-2 font-anth max-w-[74ch] mx-auto py-2">{e.body}</p>
                        : <NewsReadBody ev={e} base={base} />}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}
      <SectionCard title={`${tl('News')} · ${symbol}`}>
        {yahoo === null ? (
          <div class="px-3 py-2 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
        ) : !yahoo.length ? (
          <div class="px-3 py-2 font-mono text-[11px] text-muted">{tl('no headlines')}</div>
        ) : (
          <div class="font-mono text-[11.5px]">
            {yahoo.map((n, i) => (
              <div key={i} class="grid grid-cols-[86px_1fr_auto] gap-x-2.5 items-baseline px-3 py-[3px] border-t border-line first:border-0 hover:bg-surface-3">
                <span class="text-muted whitespace-nowrap">
                  {n.time ? new Date(n.time).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase() : '—'}
                </span>
                <a class="text-ink-2 hover:text-accent truncate" href={n.link} target="_blank" rel="noopener">{n.title}</a>
                <span class="text-[10px] text-muted truncate max-w-[16ch]">{n.publisher}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function SymbolWireView({ symbol }) {
  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const base = wireUrl()
  useEffect(() => {
    let dead = false
    setRows(null)
    setErr('')
    if (!base) return
    fetch(`${base.replace(/\/$/, '')}/api/events?symbols=${encodeURIComponent(symbol)}&limit=60&newest=1`,
          { signal: AbortSignal.timeout(10_000) })
      .then((r) => r.json())
      .then((out) => { if (!dead) setRows(out.events || []) })
      .catch((e) => { if (!dead) setErr(String(e.message || e)) })
    return () => { dead = true }
  }, [symbol, base])

  if (!base) {
    return (
      <div class="px-1 font-mono text-[11px] text-muted max-w-xl leading-relaxed">
        {tt('research.no_wire_config', { symbol })}
      </div>
    )
  }
  if (err) return <div class="px-1 font-mono text-[11px] text-down">{tt('research.wire_unreachable', { error: err })}</div>
  if (rows === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!rows.length) return <div class="px-1 font-mono text-[11px] text-muted">{tt('research.nothing_on_wire', { symbol })}</div>
  const CODE = { earnings_release: 'ERN', filing: 'FIL', headline: 'NWS',
    macro_print: 'ECO', price_move: 'PX', digest: 'DIG',
    transcript_chunk: 'LIV', brief: 'BRF' }
  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      <SectionCard title={`FRAGWIRE · ${symbol}`}>
        <div class="font-mono text-[11.5px]">
          {rows.map((e) => (
            <div key={e.id} class="grid grid-cols-[86px_36px_1fr] gap-x-2.5 items-baseline px-3 py-[3px] border-t border-line first:border-0 hover:bg-surface-3">
              <span class="text-muted whitespace-nowrap">
                {new Date(e.ts_event * 1000).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
                {' '}
                {new Date(e.ts_event * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
              </span>
              <span class={`text-[10px] tracking-wider ${e.type === 'earnings_release' || e.type === 'price_move' ? 'text-accent font-semibold' : 'text-muted'}`}>
                {CODE[e.type] || (e.type || '').slice(0, 3).toUpperCase()}
              </span>
              {e.url
                ? <a class="text-ink-2 hover:text-accent truncate" href={e.url} target="_blank" rel="noopener">{e.headline}</a>
                : <span class="text-ink-2 truncate">{e.headline}</span>}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

// DES-style stat band under the overview chart — numbered blocks, dense
// mono, the bloomberg register (Jeff's GSK DES reference, 2026-08-03)
// numbers are reserved for keyboard targets (tabs); stat cells are read-only
function DesCell({ n, label, value, tone, big }) {
  return (
    <div class="flex flex-col gap-0.5 px-2.5 py-1.5 min-w-0">
      <span class="text-[8.5px] text-muted uppercase tracking-wider truncate">{label}</span>
      <span class={`font-mono min-w-0 truncate ${big ? 'text-[14px] font-semibold' : 'text-[12.5px] font-medium'} ${tone || 'text-ink'}`} title={value ?? ''}><Fig v={value} /></span>
    </div>
  )
}

function DesBand({ symbol, bars }) {
  const [f, setF] = useState(null)
  const [yr, setYr] = useState(null)
  const [cal, setCal] = useState(null)
  const [prof, setProf] = useState(null)
  useEffect(() => {
    setF(null); setYr(null); setCal(null); setProf(null)
    fetchFundamentals(symbol).then(setF).catch(() => setF({}))
    fetchHistory(symbol, '1Y').then(setYr).catch(() => {})
    fetchEarningsDate(symbol).then(setCal).catch(() => {})
    fetchProfile(symbol).then(setProf).catch(() => {})
  }, [symbol])
  const cached = getCached(symbol)
  const q = cached?.quote
  const price = q?.price ?? (bars?.length ? bars[bars.length - 1].close : null)
  const pct = q?.pct ?? null
  let ytd = null
  if (bars?.length > 1) {
    const y = new Date().getFullYear()
    const first = bars.find((b) => new Date(b.time * 1000).getFullYear() === y)
    if (first && price != null) ytd = ((price / first.close) - 1) * 100
  }
  const tone = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')
  // trailing returns off the 1Y daily series — bars are oldest-first seconds
  const ret = (days) => {
    const bs = yr?.bars
    if (!bs?.length || price == null) return null
    const cutoff = Date.now() / 1000 - days * 86400
    const b = bs.find((x) => x.time >= cutoff)
    return b && b !== bs[bs.length - 1] ? ((price / b.close) - 1) * 100 : null
  }
  const ret1y = yr?.bars?.length && price != null
    ? ((price / yr.bars[0].close) - 1) * 100 : null
  const yNow = new Date().getFullYear()
  const yFirst = yr?.bars?.find((b) => new Date(b.time * 1000).getFullYear() === yNow)
  const ytdFull = yFirst && price != null ? ((price / yFirst.close) - 1) * 100 : null
  const wkPos = f?.fiftyTwoWeekHigh != null && f?.fiftyTwoWeekLow != null && price != null
    ? (price - f.fiftyTwoWeekLow) / (f.fiftyTwoWeekHigh - f.fiftyTwoWeekLow) : null
  return (
    <div class="border-t border-line grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 divide-x divide-line select-none">
      <DesCell n={1} label={tl('Px / Chg')} big
        value={price != null ? `${fmtPrice(price)}${pct != null ? ` ${fmtPct(pct)}` : ''}` : null}
        tone={tone(pct)} />
      <DesCell n={2} label="52wk H / L"
        value={f?.fiftyTwoWeekHigh != null ? `${fmtPrice(f.fiftyTwoWeekHigh)} / ${fmtPrice(f.fiftyTwoWeekLow)}` : null} />
      <DesCell n={3} label={tl('52wk pos')}
        value={wkPos != null ? `${Math.round(wkPos * 100)}%` : null}
        tone={wkPos != null && wkPos > 0.5 ? 'text-up' : 'text-ink-2'} />
      <DesCell n={4} label="YTD"
        value={ytd != null ? fmtPct(ytd) : null} tone={tone(ytd)} />
      <DesCell n={5} label={tl('Mkt cap / EV')}
        value={f?.marketCap != null ? `${fmtBig(f.marketCap)}${f.enterpriseValue ? ` / ${fmtBig(f.enterpriseValue)}` : ''}` : null} />
      <DesCell n={6} label={tl('Shrs out / float')}
        value={f?.sharesOutstanding != null ? `${fmtVol(f.sharesOutstanding)}${f.floatShares ? ` / ${fmtVol(f.floatShares)}` : ''}` : null} />
      <DesCell n={7} label={tl('Vol / avg')}
        value={f?.volume != null ? `${fmtVol(f.volume)}${f.averageVolume ? ` / ${fmtVol(f.averageVolume)}` : ''}` : null} />
      <DesCell n={8} label={tl('Open / prev')}
        value={f?.open != null ? `${fmtPrice(f.open)} / ${fmtPrice(f.previousClose)}` : null} />
      <DesCell n={9} label={tl('Tgt / upside')}
        value={f?.targetMeanPrice != null ? `${fmtPrice(f.targetMeanPrice)}${price ? ` ${fmtPct(((f.targetMeanPrice / price) - 1) * 100)}` : ''}` : null}
        tone={f?.targetMeanPrice != null && price ? (f.targetMeanPrice >= price ? 'text-up' : 'text-down') : null} />
      <DesCell n={10} label={tl('Consensus')}
        value={f?.recommendationKey ? f.recommendationKey.replace('_', ' ').toUpperCase() : null}
        tone={f?.recommendationKey ? ratingTone(f.recommendationKey) : null} />
      <DesCell n={11} label={tl('Short % flt')}
        value={f?.shortPercentOfFloat != null ? fmtFracPct(f.shortPercentOfFloat) : null} />
      <DesCell n={12} label={tl('Beta / D-E')}
        value={f?.beta != null ? `${fmtRatio(f.beta)}${f.debtToEquity != null ? ` / ${fmtRatio(f.debtToEquity)}` : ''}` : null} />
      <DesCell n={13} label="P/E t / fwd"
        value={f?.trailingPE != null || f?.forwardPE != null ? `${fmtRatio(f?.trailingPE)} / ${fmtRatio(f?.forwardPE)}` : null} />
      <DesCell n={14} label="EV/EBITDA"
        value={f?.enterpriseToEbitda != null ? fmtRatio(f.enterpriseToEbitda) : null} />
      <DesCell n={15} label="FCF ttm"
        value={f?.freeCashflow != null ? fmtBig(f.freeCashflow) : null} />
      <DesCell n={16} label={tl('Div yld')}
        value={f?.dividendYield != null ? fmtFracPct(f.dividendYield) : '—'} />
      <DesCell n={17} label="Ret 1w / 1m"
        value={ret(7) != null ? `${fmtPct(ret(7))} / ${fmtPct(ret(30))}` : null}
        tone={tone(ret(30))} />
      <DesCell n={18} label="Ret 3m / 6m"
        value={ret(91) != null ? `${fmtPct(ret(91))} / ${fmtPct(ret(182))}` : null}
        tone={tone(ret(182))} />
      <DesCell n={19} label="Ret ytd / 1y"
        value={ytdFull != null || ret1y != null ? `${fmtPct(ytdFull)} / ${fmtPct(ret1y)}` : null}
        tone={tone(ret1y)} />
      <DesCell n={20} label={tl('Next ern')}
        value={cal?.date ? `${new Date(cal.date).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase()} · ${Math.max(0, Math.round((cal.date - Date.now()) / 86400000))}${getLocale() === 'zh' ? '天' : 'd'}` : null} />
      <DesCell n={21} label={tl('Sector')} value={prof?.sector || null} />
      <DesCell n={22} label={tl('Industry')} value={prof?.industry || null} />
      <DesCell n={23} label={tl('Employees')}
        value={prof?.employees != null ? prof.employees.toLocaleString('en-US') : null} />
      <DesCell n={24} label="Avg $ vol"
        value={f?.averageVolume != null && price != null ? fmtBig(f.averageVolume * price) : null} />
      <DesCell n={25} label="Gross / op mgn"
        value={f?.grossMargins != null ? `${fmtFracPct(f.grossMargins)} / ${fmtFracPct(f.operatingMargins)}` : null} />
      <DesCell n={26} label="Net mgn / ROE"
        value={f?.profitMargins != null ? `${fmtFracPct(f.profitMargins)}${f.returnOnEquity != null ? ` / ${fmtFracPct(f.returnOnEquity)}` : ''}` : null} />
      <DesCell n={27} label="Rev / EPS gr"
        value={f?.revenueGrowth != null ? `${fmtFracPct(f.revenueGrowth)}${f.earningsGrowth != null ? ` / ${fmtFracPct(f.earningsGrowth)}` : ''}` : null}
        tone={f?.revenueGrowth != null ? (f.revenueGrowth >= 0 ? 'text-up' : 'text-down') : null} />
      <DesCell n={28} label="P/S / P/B"
        value={f?.priceToSalesTrailing12Months != null || f?.priceToBook != null
          ? `${fmtRatio(f?.priceToSalesTrailing12Months)} / ${fmtRatio(f?.priceToBook)}` : null} />
      <DesCell n={29} label="PEG / payout"
        value={f?.pegRatio != null || f?.payoutRatio != null
          ? `${fmtRatio(f?.pegRatio)} / ${fmtFracPct(f?.payoutRatio)}` : null} />
      <DesCell n={30} label="Div rate"
        value={f?.dividendRate != null ? fmtPrice(f.dividendRate) : '—'} />
    </div>
  )
}

function SymbolPrompt() {
  const [value, setValue] = useState('')
  const watchlist = useWatchlist()
  const recents = (() => {
    try { return JSON.parse(localStorage.getItem('tape-recent-syms') || '[]') }
    catch { return [] }
  })()
  const go = (e) => {
    e.preventDefault()
    const sym = value.trim().toUpperCase()
    if (sym) location.hash = hrefFor('research', sym.toLowerCase())
  }
  const FUNCS = [
    ['1', 'Overview', 'chart · DES stat band · technicals · fundamentals · news', ''],
    ['2', 'Chart', 'full workbench — overlays, RSI/MACD panes, compare mode', '/intraday'],
    ['3', 'Options', 'chain with greeks', '/options'],
    ['4', 'Earnings', 'years of prints, surprises, price reactions', '/earnings'],
    ['5', 'Analysts', 'rec trend, price targets, rating changes', '/analysts'],
    ['6', 'Insider', 'insider transactions', '/insider'],
    ['7', 'Holders', 'institutional + insider ownership', '/holders'],
    ['8', 'Filings', 'the SEC trail', '/filings'],
    ['9', 'Profile', 'sector, business, officers', '/profile'],
    ['0', 'Wire', 'everything fragwire captured on the name', '/wire'],
  ]
  const openSym = (sym, view = '') =>
    (location.hash = `#/research/${sym.toLowerCase()}${view}`)
  return (
    <div class="flex-1 p-6 select-none">
      <div class="max-w-4xl mx-auto flex flex-col gap-4">
        <form onSubmit={go} class="bg-surface-1 border border-line rounded-2xl p-5">
          <h1 class="font-mono font-bold text-[13px] tracking-wider text-accent uppercase mb-1">{tl('Research')}</h1>
          <p class="font-mono text-[11px] text-muted mb-3">
            {tt('research.landing_hint')}
          </p>
          <div class="flex gap-2 max-w-sm">
            <input
              value={value}
              onInput={(e) => setValue(e.target.value)}
              placeholder="NVDA, SPY, BTC-USD…"
              class="flex-1 bg-surface-0 border border-line-2 rounded-lg px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent"
            />
            <button type="submit" class="bg-accent text-surface-0 font-mono font-bold text-[12px] px-4 rounded-lg hover:opacity-90">{tl('GO')}</button>
          </div>
        </form>

        <div class="grid gap-4 md:grid-cols-2">
          <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
            <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
              <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Functions')}</h2>
            </header>
            <div class="py-1">
              {FUNCS.map(([n, name, desc, view]) => (
                <button
                  key={n}
                  onClick={() => { const target = recents[0] || watchlist[0]; if (target) openSym(target, view) }}
                  // grid, not flex+widths: tracks align by construction, so
                  // mobile font inflation can't stagger the columns
                  // (Jeff 2026-08-06: "align the content here into columns")
                  class="w-full text-left px-3 py-[5px] font-mono text-[11.5px] hover:bg-surface-3 grid grid-cols-[1.4rem_5.6rem_minmax(0,1fr)] gap-2 items-baseline"
                >
                  <span class="text-accent">{n})</span>
                  <span class="text-ink">{tl(name)}</span>
                  <span class="text-muted truncate">{tl(desc)}</span>
                </button>
              ))}
            </div>
          </section>

          <div class="flex flex-col gap-4">
            <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
              <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
                <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Watchlist')}</h2>
              </header>
              <div class="p-2.5 flex flex-wrap gap-1.5">
                {watchlist.slice(0, 16).map((sym) => (
                  <button
                    key={sym}
                    onClick={() => openSym(sym)}
                    class="font-mono text-[11px] px-2 py-1 rounded border border-line text-ink-2 hover:text-accent hover:border-accent/60"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            </section>
            {recents.length > 0 && (
              <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
                <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
                  <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Recent')}</h2>
                </header>
                <div class="p-2.5 flex flex-wrap gap-1.5">
                  {recents.slice(0, 10).map((sym) => (
                    <button
                      key={sym}
                      onClick={() => openSym(sym)}
                      class="font-mono text-[11px] px-2 py-1 rounded border border-line text-ink-2 hover:text-accent hover:border-accent/60"
                    >
                      {sym}
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
              <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
                <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('From the terminal')}</h2>
              </header>
              <div class="p-3 font-mono text-[11px] text-muted leading-relaxed">
                {tt('research.terminal_hint')}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}

// Dense symbol tape under the DES band — the overview's dead zone becomes
// the last 10 things fragwire caught on this name. Hidden when no wire.
function WireMini({ symbol }) {
  const [rows, setRows] = useState(null)
  const base = wireUrl()
  useEffect(() => {
    let dead = false
    setRows(null)
    if (!base) return
    fetch(`${base.replace(/\/$/, '')}/api/events?symbols=${encodeURIComponent(symbol)}&limit=10&newest=1`,
          { signal: AbortSignal.timeout(8_000) })
      .then((r) => r.json())
      .then((out) => { if (!dead) setRows(out.events || []) })
      .catch(() => { if (!dead) setRows([]) })
    return () => { dead = true }
  }, [symbol, base])
  if (!base || !rows?.length) return null
  const CODE = { earnings_release: 'ERN', filing: 'FIL', headline: 'NWS',
    macro_print: 'ECO', price_move: 'PX', digest: 'DIG',
    transcript_chunk: 'LIV', brief: 'BRF' }
  return (
    <div class="border-t border-line">
      <div class="flex items-baseline gap-2 px-3 pt-1.5 pb-0.5">
        <span class="font-mono font-bold text-[10px] tracking-wider text-accent uppercase">FRAGWIRE</span>
        <a href={`#/research/${symbol.toLowerCase()}/wire`} class="font-mono text-[9.5px] text-muted hover:text-ink">0) {tl('all')} →</a>
      </div>
      <div class="font-mono text-[11px] pb-1">
        {rows.map((e, i) => (
          <div key={e.id} class="grid grid-cols-[18px_78px_30px_1fr] gap-x-2 items-baseline px-3 py-[2px] hover:bg-surface-3">
            <span class="text-muted text-[10px] text-right">{i + 1})</span>
            <span class="text-muted text-[10.5px] whitespace-nowrap">
              {new Date(e.ts_event * 1000).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
              {' '}
              {new Date(e.ts_event * 1000).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })}
            </span>
            <span class={`text-[9.5px] tracking-wider ${e.type === 'earnings_release' || e.type === 'price_move' ? 'text-accent font-semibold' : 'text-muted'}`}>
              {CODE[e.type] || (e.type || '').slice(0, 3).toUpperCase()}
            </span>
            <span class="text-ink-2 truncate min-w-0" title={e.headline}>{e.headline}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Dividend read: yield/rate/dates from fundamentals + the broker's
 *  dividend markdown when a wire is connected. */
function DividendsView({ symbol }) {
  const [f, setF] = useState(null)
  const [md, setMd] = useState(null)
  useEffect(() => {
    setF(null); setMd(null)
    fetchFundamentals(symbol).then(setF).catch(() => setF({}))
    const base = wireUrl()
    if (base) {
      fetch(`${base.replace(/\/$/, '')}/api/ibkr/dividends?scope=symbol&symbol=${encodeURIComponent(symbol)}`,
        { signal: AbortSignal.timeout(25_000) })
        .then((r) => r.json())
        .then((out) => setMd(out.ok ? out.markdown : null))
        .catch(() => setMd(null))
    }
  }, [symbol])
  const cellRow = (label, value) => (
    <div class="flex justify-between gap-3 px-3 py-[4px] border-b border-line last:border-0">
      <span class="font-anth text-muted text-[11px]">{label}</span>
      <span class="font-mono text-[11px] text-ink">{value ?? '—'}</span>
    </div>
  )
  return (
    <div class="flex flex-col gap-2 max-w-2xl">
      <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
        <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Dividends')} — {symbol}</h2>
        </header>
        {f == null ? (
          <div class="px-3 py-2 font-mono text-[11px] text-muted animate-pulse">{tl('loading…')}</div>
        ) : (
          <>
            {cellRow('Yield', f.dividendYield != null ? fmtFracPct(f.dividendYield) : '—')}
            {cellRow('Rate (annual)', f.dividendRate != null ? fmtPrice(f.dividendRate) : '—')}
            {cellRow('Payout ratio', f.payoutRatio != null ? fmtFracPct(f.payoutRatio) : '—')}
            {cellRow('Ex-div date', f.exDividendDate
              ? new Date(f.exDividendDate * 1000).toLocaleDateString(getLocale() === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—')}
          </>
        )}
      </section>
      {md && md.trim() && !/^no dividend/i.test(md.trim()) && (
        <section class="bg-surface-1 border border-line rounded-xl px-3 py-2 font-anth text-[12.5px] leading-relaxed text-ink-2">
          <MdLite text={md} />
        </section>
      )}
      {f != null && f.dividendYield == null && (
        <p class="px-1 font-mono text-[10.5px] text-muted">{symbol} pays no dividend — growth name, the yield is the thesis.</p>
      )}
    </div>
  )
}

function WatchStar({ symbol }) {
  const watched = useWatchlist().includes(symbol)
  return (
    <button
      onClick={() => (watched ? unwatch(symbol) : watch(symbol))}
      title={watched ? 'unwatch' : 'watch'}
      class={`text-[15px] leading-none ${watched ? 'text-accent' : 'text-muted hover:text-accent'}`}
    >
      {watched ? '★' : '☆'}
    </button>
  )
}

export function Research({ route }) {
  const symbol = route.sub
  useEffect(() => {
    if (!symbol) return
    try {
      const cur = JSON.parse(localStorage.getItem('tape-recent-syms') || '[]')
        .filter((s) => s !== symbol.toUpperCase())
      cur.unshift(symbol.toUpperCase())
      localStorage.setItem('tape-recent-syms', JSON.stringify(cur.slice(0, 12)))
    } catch { /* storage unavailable */ }
  }, [symbol])
  const [rangeKey, setRangeKey] = useState(() => {
    const prefill = consumePrefill('chart_range')
    const saved = localStorage.getItem('research_overview_range_v1')
    const candidate = prefill || saved || '6M'
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
  const [warmPad, setWarmPad] = useState(null)
  const [err, setErr] = useState(null)
  // intraday tick override (1D: 1m/2m/5m/15m, 5D: 5m…1h) — the default 5m
  // was the ONLY resolution and that's no way to read an open (Jeff
  // 2026-08-06). Persisted per range so 1D can live on 1m while 5D stays 15m.
  const [ticks, setTicks] = useState(() => {
    try { return JSON.parse(localStorage.getItem('research_ticks_v1')) || {} } catch { return {} }
  })
  const activeRange = RANGES.find((x) => x.key === rangeKey)
  const tick = activeRange?.ticks?.includes(ticks[rangeKey]) ? ticks[rangeKey] : null
  const setTick = (value) => {
    const next = { ...ticks, [rangeKey]: value }
    setTicks(next)
    try { localStorage.setItem('research_ticks_v1', JSON.stringify(next)) } catch { /* best-effort */ }
  }
  // Header quote comes from the live 1D feed — a multi-month chart fetch
  // reports change vs the range START (chartPreviousClose), not yesterday.
  const live = useQuotes(symbol ? [symbol] : [])

  useEffect(() => {
    if (!symbol) return
    setHist(null)
    setErr(null)
    fetchHistory(symbol, rangeKey, { interval: tick })
      .then(setHist)
      .catch((e) => setErr(String(e.message || e)))
    // warm-up bars for the oscillators; failure is silent — indicators just
    // start where they used to
    setWarmPad(null)
    fetchHistory(symbol, rangeKey, { warm: true, interval: tick })
      .then((h) => setWarmPad(h.bars))
      .catch(() => {})
  }, [symbol, rangeKey, tick])

  // bloomberg speed keys: the tab numbers are commands — press 3, land on
  // Options. 0 = the tenth tab. Inputs keep their digits.
  useEffect(() => {
    if (!symbol) return
    const VIEWS = [null, 'news', 'intraday', 'options', 'earnings',
                   'analysts', 'financials', 'ownership', 'filings', 'profile']
    const onKey = (e) => {
      if (e.target instanceof HTMLInputElement
          || e.target instanceof HTMLTextAreaElement
          || e.metaKey || e.ctrlKey || e.altKey) return
      if (!/^[0-9]$/.test(e.key)) return
      const i = e.key === '0' ? 9 : Number(e.key) - 1
      if (i >= VIEWS.length) return
      const v = VIEWS[i]
      location.hash = `#/research/${symbol.toLowerCase()}${v ? '/' + v : ''}`
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [symbol])

  if (!symbol) return <SymbolPrompt />

  const q = live[symbol]?.quote
  const up = (q?.pct ?? 0) >= 0
  const extUp = (q?.extPct ?? 0) >= 0
  const [railOpen, setRailOpen] = useState(false)
  const rail = (
    <>
      <AiReport
        label="AI report"
        filename={`${symbol.toLowerCase()}-report.md`}
        buildPrompt={() => buildMemoPrompt(symbol)}
        archive={{ kind: 'memo', symbol, title: `${symbol} memo` }}
      />
      <Technicals symbol={symbol} />
      <Fundamentals symbol={symbol} />
      <News symbol={symbol} />
    </>
  )

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <div class="flex items-baseline gap-3 px-1 pb-2 flex-wrap">
        <h1 class="font-tick font-bold text-lg text-ink">{symbol}</h1>
        <WatchStar symbol={symbol} />
        {q && (
          <>
            {/* the name owns the middle slack; the quote cluster is one
                right-aligned unit so it can't sit on top of the name
                (Jeff 2026-08-05: "even Walmart gets occluded") */}
            {/* the slack can shrink to zero at tight zooms, which crushed the
                name to two letters ("Ap…", Jeff 2026-08-06). A readable floor
                forces the quote cluster to wrap under instead — the header
                already flex-wraps — and the marquee reveals anything longer. */}
            <span class="flex-1 min-w-[16ch]">
              <Marquee text={q.name} class="w-full text-[12px] text-muted font-anth" />
            </span>
            {/* when the header wraps (phones) the quote line starts at the
                left margin like everything else — ml-auto only makes sense
                while it shares a line with the name (Jeff 2026-08-06) */}
            {/* max-sm the cluster may exceed the viewport (AH tail clipped off
                the right, Jeff 2026-08-06) — let the units wrap; each inner
                span stays nowrap so a unit never breaks mid-number */}
            <span class="ml-auto max-sm:ml-0 max-sm:w-full flex items-baseline gap-x-3 gap-y-0.5 shrink-0 whitespace-nowrap max-sm:flex-wrap">
              <span class="font-mono font-bold text-lg text-ink"><FlashPrice price={q.price} fmt={fmtPrice} /></span>
              <span class={`font-mono text-[15px] ${up ? 'text-up' : 'text-down'}`}>
                <span class="font-semibold"><FlashMetric value={q.change} fmt={fmtChange} /></span>{' '}
                <span class="font-normal"><FlashMetric value={q.pct} fmt={fmtPct} /></span>
              </span>
              {q.volume != null && (
                <span class="font-mono text-[11px] text-muted">vol {fmtVol(q.volume)}</span>
              )}
              {q.extLabel && q.extPrice != null && (
                <span class="font-mono text-[12px] whitespace-nowrap">
                  <span class={extendedLabelClass(q.extLabel)}>{q.extLabel}</span>{' '}
                  <span class="text-ink-2"><FlashPrice price={q.extPrice} fmt={fmtPrice} /></span>
                  {q.extPct != null && (
                    <span class={`ml-1.5 ${extUp ? 'text-up' : 'text-down'}`}>
                      {extUp ? '▲' : '▼'}{Math.abs(q.extPct).toFixed(2)}%
                    </span>
                  )}
                </span>
              )}
            </span>
          </>
        )}
        {/* range + tick pills drive only the Overview chart — on the Chart
            tab they doubled ChartSuite's own picker, and on every other tab
            they were dead controls (Jeff 2026-08-06: "redundancy w the
            timeframes"). Overview-only. */}
        {route.view == null && activeRange?.ticks && (
          <div class="flex items-center gap-1 shrink-0">
            {activeRange.ticks.map((v) => (
              <button key={v} onClick={() => setTick(v === (tick || activeRange.interval) ? v : v)}
                class={`font-mono text-[10px] px-1.5 py-1 rounded-md border whitespace-nowrap ${
                  (tick || activeRange.interval) === v
                    ? 'border-accent-2/60 text-accent-2 bg-accent-2-soft'
                    : 'border-line/60 text-muted hover:text-ink hover:border-line-2'}`}>
                {v}
              </button>
            ))}
          </div>
        )}
        {route.view == null && (
          <div class="flex gap-1 flex-nowrap overflow-x-auto no-scrollbar shrink-0 max-w-full">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => selectRange(r.key)}
                class={`font-mono text-[10px] px-2 py-1 rounded-md border whitespace-nowrap shrink-0 ${
                  rangeKey === r.key
                    ? 'border-accent-2 text-accent-2 bg-accent-2-soft'
                    : 'border-accent/30 text-muted hover:text-ink hover:bg-surface-3'
                }`}
              >
                {r.key.toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      <div class="flex gap-1 px-1 pb-2 select-none flex-nowrap overflow-x-auto no-scrollbar">
        {[
          { id: null, label: tl('Overview'), href: `#/research/${symbol.toLowerCase()}` },
          { id: 'news', label: tl('News'), href: `#/research/${symbol.toLowerCase()}/news` },
          { id: 'intraday', label: tl('Chart'), href: `#/research/${symbol.toLowerCase()}/intraday` },
          { id: 'options', label: tl('Options'), href: `#/research/${symbol.toLowerCase()}/options` },
          { id: 'earnings', label: tl('Earnings'), href: `#/research/${symbol.toLowerCase()}/earnings` },
          { id: 'analysts', label: tl('Analysts'), href: `#/research/${symbol.toLowerCase()}/analysts` },
          { id: 'financials', label: tl('Financials'), href: `#/research/${symbol.toLowerCase()}/financials` },
          { id: 'ownership', label: tl('Ownership'), href: `#/research/${symbol.toLowerCase()}/ownership` },
          { id: 'filings', label: tl('Filings'), href: `#/research/${symbol.toLowerCase()}/filings` },
          { id: 'profile', label: tl('Profile'), href: `#/research/${symbol.toLowerCase()}/profile` },
        ].map((tab, ti) => (
          <a
            key={tab.label}
            href={tab.href}
            class={`font-mono text-[9px] px-2.5 py-1 rounded-md border hover:no-underline whitespace-nowrap shrink-0 ${
              route.view === tab.id
                ? 'border-accent-2 text-accent-2 bg-accent-2-soft'
                : 'border-white/25 text-muted hover:text-ink hover:bg-surface-3'
            }`}
          >
            <span class="text-accent">{(ti + 1) % 10})</span> {tab.label}
          </a>
        ))}
      </div>

      {err && (
        <div class="mx-1 mb-2 px-3 py-2 bg-surface-1 border border-down/40 rounded-lg font-mono text-[11px] text-down">
          {err} — check the symbol or try again
        </div>
      )}

      {route.view === 'options' ? (
        <OptionsView symbol={symbol} />
      ) : route.view === 'intraday' ? (
        <ChartSuite symbol={symbol} />
      ) : route.view === 'earnings' ? (
        <EarningsView symbol={symbol} />
      ) : route.view === 'holders' || route.view === 'insider' || route.view === 'ownership' ? (
        <OwnershipView symbol={symbol} />
      ) : route.view === 'financials' ? (
        <FinancialsView symbol={symbol} />
      ) : route.view === 'filings' ? (
        <FilingsView symbol={symbol} />
      ) : route.view === 'wire' || route.view === 'news' ? (
        <SymbolNewsView symbol={symbol} name={q?.name} />
      ) : route.view === 'dividends' ? (
        <DividendsView symbol={symbol} />
      ) : route.view === 'profile' ? (
        <ProfileView symbol={symbol} />
      ) : route.view === 'analysts' ? (
        <AnalystsView symbol={symbol} />
      ) : (
        <div class="grid gap-2 lg:grid-cols-[1fr_320px]">
          <section class="bg-surface-1 border border-line rounded-xl min-w-0 overflow-hidden flex flex-col self-stretch">
            <div class="p-2 pb-0">
            {hist ? (
              <Candles bars={hist.bars} warmPad={warmPad} intraday={hist.intraday} />
            ) : (
              <div class="h-[380px] flex items-center justify-center font-mono text-[11px] text-muted">
                {err ? 'no chart' : 'loading…'}
              </div>
            )}
            </div>
            <DesBand symbol={symbol} bars={hist?.bars} />
            <WireMini symbol={symbol} />
            {/* when the right rail runs longer, the column keeps its ruling
                instead of ending mid-air (Jeff 2026-08-04) */}
            <div class="flex-1 min-h-0 border-t border-line bg-[repeating-linear-gradient(180deg,transparent,transparent_27px,var(--color-line)_27px,var(--color-line)_28px)]" />
          </section>
          <div class="max-lg:hidden flex flex-col gap-3 min-w-0">{rail}</div>
          {/* below lg the rail lives behind a right-edge grip: a slide-over
             panel, not a stack the user has to scroll past */}
          <button
            onClick={() => setRailOpen(!railOpen)}
            title={railOpen ? 'hide panel' : 'show panel'}
            class={`lg:hidden fixed top-1/2 -translate-y-1/2 z-50 py-4 px-0.5 rounded-l-md border border-r-0 border-line bg-surface-1 font-mono text-[10px] leading-[0.6] text-muted hover:text-ink transition-all ${railOpen ? 'right-[320px]' : 'right-0'}`}
          >
            ⋮
          </button>
          {railOpen && (
            <aside class="lg:hidden fixed right-0 top-0 bottom-0 w-[320px] z-40 overflow-y-auto bg-surface-0 border-l border-line p-2 flex flex-col gap-3">
              {rail}
            </aside>
          )}
        </div>
      )}
    </div>
  )
}
