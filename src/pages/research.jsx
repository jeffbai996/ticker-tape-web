import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, CandlestickSeries, HistogramSeries } from 'lightweight-charts'
import { useQuotes } from '../hooks.js'
import { fetchHistory, fetchNews, RANGES } from '../lib/history.js'
import { fetchFundamentals } from '../lib/fundamentals.js'
import { fetchOptions } from '../lib/options.js'
import { fetchInsider } from '../lib/fundamentals.js'
import { fetchEarningsImpact } from '../lib/earnings.js'
import { fetchAnalysts } from '../lib/fundamentals.js'
import { fetchProfile, fetchHolders } from '../lib/fundamentals.js'
import { fetchFilings } from '../lib/edgar.js'
import { wireUrl } from '../lib/wire.js'
import { bsDelta } from '../lib/bs.js'
import { vwapSeries } from '../lib/vwap.js'
import { LineSeries } from 'lightweight-charts'
import { sma, rsi, macd, bollinger } from '../lib/indicators.js'
import { fmtPrice, fmtPct, fmtChange, fmtVol, fmtBig, fmtRatio, fmtFracPct } from '../lib/format.js'
import { hrefFor } from '../lib/route.js'
import { tl, t as tt } from '../lib/i18n.js'
import { watch, unwatch } from '../lib/watchlist.js'
import { useWatchlist } from '../hooks.js'
import { getCached } from '../lib/feed.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { memoPrompt, BRIEFING_SYSTEM } from '../lib/briefing.js'
import { AiReport } from '../components/AiReport.jsx'
import { ChartSuite } from '../components/ChartSuite.jsx'

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

function Candles({ bars, intraday }) {
  const el = useRef(null)
  const chartRef = useRef(null)
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
      timeScale: { borderColor: 'rgba(255,255,255,0.10)', timeVisible: intraday },
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
    return () => chart.remove()
  }, [intraday])

  useEffect(() => {
    const c = chartRef.current
    if (!c || !bars) return
    c.series.setData(bars)
    c.extra.forEach((sr) => { try { c.chart.removeSeries(sr) } catch { /* gone */ } })
    c.extra = []
    for (const n of [20, 50, 200]) {
      if (!ov['sma' + n] || bars.length < n) continue
      const line = c.chart.addSeries(LineSeries, {
        color: SMA_COLORS[n], lineWidth: 1,
        priceLineVisible: false, lastValueVisible: false,
      })
      line.setData(rollingSma(bars, n))
      c.extra.push(line)
    }
    if (ov.vol && bars.some((b) => b.volume)) {
      const vol = c.chart.addSeries(HistogramSeries, {
        priceScaleId: 'vol', priceFormat: { type: 'volume' },
        priceLineVisible: false, lastValueVisible: false,
      })
      c.chart.priceScale('vol').applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      })
      vol.setData(bars.map((b) => ({
        time: b.time, value: b.volume || 0,
        color: b.close >= b.open ? 'rgba(63,185,80,.35)' : 'rgba(248,81,73,.35)',
      })))
      c.extra.push(vol)
    }
    c.chart.timeScale().fitContent()
  }, [bars, ov])

  return (
    <div>
      <div class="flex gap-1 px-1 pb-1.5 select-none">
        {[['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['sma200', 'SMA 200'], ['vol', 'VOL']].map(([k, label]) => (
          <button
            key={k}
            onClick={() => toggle(k)}
            class={`font-mono text-[9.5px] px-1.5 py-0.5 rounded border tracking-wider ${
              ov[k] ? 'border-accent/60 text-accent' : 'border-line text-muted hover:text-ink'
            }`}
            style={ov[k] && k.startsWith('sma') ? { color: SMA_COLORS[k.slice(3)], borderColor: SMA_COLORS[k.slice(3)] + '99' } : undefined}
          >
            {label}
          </button>
        ))}
      </div>
      <div ref={el} class="h-[352px] w-full" />
    </div>
  )
}

function Stat({ label, value, cls = 'text-ink' }) {
  return (
    <div class="flex justify-between gap-3 px-3 py-[4px] border-b border-line last:border-0">
      <span class="text-muted text-[11px]">{label}</span>
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

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Technicals — daily')}</h2>
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
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Fundamentals')}</h2>
        {f?.recommendationKey && (
          <span class="font-mono text-[10px] text-ink-2 uppercase">{f.recommendationKey.replace('_', ' ')}</span>
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
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('News')}</h2>
      </header>
      {items == null && <div class="px-3 py-3 text-[11px] text-muted font-mono">{tt('common.loading')}</div>}
      {items?.length === 0 && <div class="px-3 py-3 text-[11px] text-muted font-mono">{tl('no headlines')}</div>}
      {items?.map((n) => (
        <a
          key={n.link}
          href={n.link}
          target="_blank"
          rel="noopener noreferrer"
          class="block px-3 py-2 border-b border-line last:border-0 hover:bg-surface-2"
        >
          <div class="text-[12px] text-ink leading-snug">{n.title}</div>
          <div class="font-mono text-[10px] text-muted mt-0.5">
            {n.publisher}
            {n.time && ` · ${new Date(n.time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
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
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="text-[9px] text-muted uppercase tracking-wider bg-surface-2/60">
              <th class="px-2 py-1.5 text-right">Strike</th>
              {/* Last goes first on phones: bid/ask carry the live market. */}
              <th class="px-2 py-1.5 text-right max-sm:hidden">Last</th>
              <th class="px-2 py-1.5 text-right">Bid</th>
              <th class="px-2 py-1.5 text-right">Ask</th>
              <th class="px-2 py-1.5 text-right">IV</th>
              <th class="px-2 py-1.5 text-right">Δ</th>
              <th class="px-2 py-1.5 text-right">Vol</th>
              <th class="px-2 py-1.5 text-right">OI</th>
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
                  class={`border-t ${i === crossIdx ? 'border-accent/60' : 'border-line'} ${c.itm ? 'bg-accent-soft/40' : ''} hover:bg-surface-2`}
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

  useEffect(() => {
    setChain(null)
    setErr(null)
    fetchOptions(symbol, expiration)
      .then(setChain)
      .catch((e) => setErr(String(e.message || e)))
  }, [symbol, expiration])

  if (err) {
    return (
      <div class="mx-1 px-3 py-2 bg-surface-1 border border-down/40 rounded-lg font-mono text-[11px] text-down">
        no options chain — {err}
      </div>
    )
  }
  if (!chain) return <div class="px-2 font-mono text-[11px] text-muted">loading chain…</div>

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
        <span class="font-mono text-[11px] text-muted">EXPIRY</span>
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
            spot <span class="text-ink">{fmtPrice(chain.spot)}</span> · amber rule = spot · shaded = ITM · Δ via Black-Scholes from IV · <span class="text-accent">vol</span> = vol&gt;OI
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
          timeScale: { borderColor: 'rgba(255,255,255,0.10)', timeVisible: true },
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
        <span class="text-muted">5-min bars · session</span>
        <span style={{ color: '#f59e0b' }}>— VWAP</span>
        {state === 'error' && <span class="text-down">no intraday data</span>}
      </div>
      <div ref={el} class="h-[420px] w-full" />
    </section>
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
              <tr key={i} class="border-t border-line hover:bg-surface-2">
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
              <th class="px-3 py-2 text-left">{tl('Peers')}</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((e) => (
              <tr key={e.quarter ?? e.report} class="border-t border-line hover:bg-surface-2">
                <td class="px-3 py-[3px] text-ink-2 whitespace-nowrap">
                  {e.quarter ? new Date(e.quarter).toISOString().slice(0, 10) : '—'}
                </td>
                <td class="px-2 py-[3px] text-muted whitespace-nowrap">
                  {e.report ? new Date(e.report).toISOString().slice(0, 10) : '—'}
                </td>
                <td class="px-2 py-[3px] text-right text-ink-2">{e.epsEstimate != null ? e.epsEstimate.toFixed(2) : '—'}</td>
                <td class="px-2 py-[3px] text-right text-ink">{e.epsActual.toFixed(2)}</td>
                <td class={`px-2 py-[3px] text-right ${pctTone(e.surprisePct)}`}>
                  {e.surprisePct != null ? fmtPct(e.surprisePct * 100) : '—'}
                </td>
                <td class={`px-2 py-[3px] text-right ${pctTone(e.priceMove)}`}>
                  {e.priceMove != null ? fmtPct(e.priceMove) : '—'}
                </td>
                <td class="px-3 py-[3px] whitespace-nowrap">
                  {e.peers.length
                    ? e.peers.map((p) => (
                        <span key={p.sym} class="mr-2">
                          <span class="text-muted">{p.sym}</span>{' '}
                          <span class={pctTone(p.move)}>{fmtPct(p.move)}</span>
                        </span>
                      ))
                    : <span class="text-muted">—</span>}
                </td>
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
            <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">
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
            <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">
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
            <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Recent rating changes')}</h2>
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
                <tr key={i} class="border-t border-line hover:bg-surface-2">
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

function SectionCard({ title, children }) {
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
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

function ProfileView({ symbol }) {
  const [p, failed] = useFetched(symbol, fetchProfile)
  if (failed || (p === null && failed)) {
    return <div class="px-1 font-mono text-[11px] text-muted">no profile for {symbol}</div>
  }
  if (p === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!p) return <div class="px-1 font-mono text-[11px] text-muted">no profile for {symbol}</div>
  return (
    <div class="grid gap-3 items-start xl:grid-cols-2">
      <div class="flex flex-col gap-3 min-w-0">
      <SectionCard title={tl('Company')}>
        <div class="p-4 pt-3 font-mono text-[12px] flex flex-wrap gap-x-6 gap-y-1">
          <span><span class="text-muted">{tl('Sector')}</span> <span class="text-ink">{p.sector || '—'}</span></span>
          <span><span class="text-muted">{tl('Industry')}</span> <span class="text-ink-2">{p.industry || '—'}</span></span>
          <span><span class="text-muted">{tl('Employees')}</span> <span class="text-ink-2">{p.employees ? p.employees.toLocaleString() : '—'}</span></span>
          <span><span class="text-muted">HQ</span> <span class="text-ink-2">{[p.city, p.state, p.country].filter(Boolean).join(', ') || '—'}</span></span>
          {p.website && <a class="text-accent" href={p.website} target="_blank" rel="noopener">{p.website.replace(/^https?:\/\//, '')}</a>}
        </div>
      </SectionCard>
      {p.summary && (
        <SectionCard title={tl('Business')}>
          <p class="p-4 pt-3 text-[12.5px] leading-relaxed text-ink-2 max-w-[74ch]">{p.summary}</p>
        </SectionCard>
      )}
      </div>
      {p.officers.length > 0 && (
        <SectionCard title={tl('Officers')}>
          <table class="w-full border-collapse font-mono text-[11px]">
            <tbody>
              {p.officers.map((o) => (
                <tr key={o.name} class="border-t border-line first:border-0">
                  <td class="px-3 py-[4px] text-ink whitespace-nowrap">{o.name}</td>
                  <td class="px-2 py-[4px] text-muted">{o.title}</td>
                  <td class="px-3 py-[4px] text-right text-ink-2 whitespace-nowrap">{o.pay != null ? fmtBig(o.pay) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}
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
                <tr key={o.org} class="border-t border-line hover:bg-surface-2">
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
              <tr key={i} class="border-t border-line hover:bg-surface-2">
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
        no wire backend configured — this tab shows everything your fragwire
        service has captured on {symbol} (releases, filings, price moves,
        live-call digests). set the endpoint on the <a class="text-accent" href="#/wire">wire tab</a> first.
      </div>
    )
  }
  if (err) return <div class="px-1 font-mono text-[11px] text-down">wire unreachable: {err}</div>
  if (rows === null) return <div class="px-1 font-mono text-[11px] text-muted">{tt('common.loading')}</div>
  if (!rows.length) return <div class="px-1 font-mono text-[11px] text-muted">nothing on the wire for {symbol} yet</div>
  const CODE = { earnings_release: 'ERN', filing: 'FIL', headline: 'NWS',
    macro_print: 'ECO', price_move: 'PX', digest: 'DIG',
    transcript_chunk: 'LIV', brief: 'BRF' }
  return (
    <div class="flex flex-col gap-3 max-w-6xl">
      <SectionCard title={`${tl('On the wire')} · ${symbol}`}>
        <div class="font-mono text-[11.5px]">
          {rows.map((e) => (
            <div key={e.id} class="grid grid-cols-[86px_36px_1fr] gap-x-2.5 items-baseline px-3 py-[3px] border-t border-line first:border-0 hover:bg-surface-2">
              <span class="text-muted whitespace-nowrap">
                {new Date(e.ts_event * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
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
      <span class={`font-mono min-w-0 truncate ${big ? 'text-[13px] font-semibold' : 'text-[11px]'} ${tone || 'text-ink'}`} title={value ?? ''}>{value ?? '—'}</span>
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
    <div class="border-t border-line grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 divide-x divide-line select-none">
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
        value={f?.recommendationKey ? f.recommendationKey.replace('_', ' ').toUpperCase() : null} />
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
        value={cal?.date ? `${new Date(cal.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()} · ${Math.max(0, Math.round((cal.date - Date.now()) / 86400000))}d` : null} />
      <DesCell n={21} label={tl('Sector')} value={prof?.sector || null} />
      <DesCell n={22} label={tl('Industry')} value={prof?.industry || null} />
      <DesCell n={23} label={tl('Employees')}
        value={prof?.employees != null ? prof.employees.toLocaleString('en-US') : null} />
      <DesCell n={24} label="Avg $ vol"
        value={f?.averageVolume != null && price != null ? fmtBig(f.averageVolume * price) : null} />
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
          <h1 class="font-mono font-bold text-[13px] tracking-wider text-accent uppercase mb-1">Research</h1>
          <p class="font-mono text-[11px] text-muted mb-3">
            type a symbol — or hit a number once a name is open. every function below works on any listed security.
          </p>
          <div class="flex gap-2 max-w-sm">
            <input
              value={value}
              onInput={(e) => setValue(e.target.value)}
              placeholder="NVDA, SPY, BTC-USD…"
              class="flex-1 bg-surface-0 border border-line-2 rounded-lg px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent"
            />
            <button type="submit" class="bg-accent text-surface-0 font-mono font-bold text-[12px] px-4 rounded-lg hover:opacity-90">GO</button>
          </div>
        </form>

        <div class="grid gap-4 md:grid-cols-2">
          <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
            <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
              <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">Functions</h2>
            </header>
            <div class="py-1">
              {FUNCS.map(([n, name, desc, view]) => (
                <button
                  key={n}
                  onClick={() => { const target = recents[0] || watchlist[0]; if (target) openSym(target, view) }}
                  class="w-full text-left px-3 py-[5px] font-mono text-[11.5px] hover:bg-surface-2 flex gap-2 items-baseline"
                >
                  <span class="text-accent w-5">{n})</span>
                  <span class="text-ink w-20">{name}</span>
                  <span class="text-muted truncate">{desc}</span>
                </button>
              ))}
            </div>
          </section>

          <div class="flex flex-col gap-4">
            <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
              <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
                <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">Watchlist</h2>
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
                  <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">Recent</h2>
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
                <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">From the terminal</h2>
              </header>
              <div class="p-3 font-mono text-[11px] text-muted leading-relaxed">
                <span class="text-ink-2">MU</span> open research · <span class="text-ink-2">ta MU</span> chart ·{' '}
                <span class="text-ink-2">an MU</span> analysts · <span class="text-ink-2">vs MU NVDA</span> compare ·{' '}
                <span class="text-ink-2">w MU</span> watch — full list: <span class="text-ink-2">h</span>
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
        <span class="font-mono font-bold text-[10px] tracking-wider text-accent uppercase">{tl('On the wire')}</span>
        <a href={`#/research/${symbol.toLowerCase()}/wire`} class="font-mono text-[9.5px] text-muted hover:text-ink">0) {tl('all')} →</a>
      </div>
      <div class="font-mono text-[11px] pb-1">
        {rows.map((e, i) => (
          <div key={e.id} class="grid grid-cols-[18px_78px_30px_1fr] gap-x-2 items-baseline px-3 py-[2px] hover:bg-surface-2">
            <span class="text-muted text-[10px] text-right">{i + 1})</span>
            <span class="text-muted text-[10.5px] whitespace-nowrap">
              {new Date(e.ts_event * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()}
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
  const [rangeKey, setRangeKey] = useState('6M')
  const [hist, setHist] = useState(null)
  const [err, setErr] = useState(null)
  // Header quote comes from the live 1D feed — a multi-month chart fetch
  // reports change vs the range START (chartPreviousClose), not yesterday.
  const live = useQuotes(symbol ? [symbol] : [])

  useEffect(() => {
    if (!symbol) return
    setHist(null)
    setErr(null)
    fetchHistory(symbol, rangeKey)
      .then(setHist)
      .catch((e) => setErr(String(e.message || e)))
  }, [symbol, rangeKey])

  // bloomberg speed keys: the tab numbers are commands — press 3, land on
  // Options. 0 = the tenth tab. Inputs keep their digits.
  useEffect(() => {
    if (!symbol) return
    const VIEWS = [null, 'intraday', 'options', 'earnings', 'analysts',
                   'insider', 'holders', 'filings', 'profile', 'wire']
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

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <div class="flex items-baseline gap-3 px-1 pb-2 flex-wrap">
        <h1 class="font-mono font-bold text-lg text-ink">{symbol}</h1>
        <WatchStar symbol={symbol} />
        {q && (
          <>
            <span class="text-[12px] text-muted">{q.name}</span>
            <span class="font-mono text-lg text-ink">{fmtPrice(q.price)}</span>
            <span class={`font-mono font-semibold text-[15px] ${up ? 'text-up' : 'text-down'}`}>
              {fmtChange(q.change)} {fmtPct(q.pct)}
            </span>
            {q.volume != null && (
              <span class="font-mono text-[11px] text-muted">vol {fmtVol(q.volume)}</span>
            )}
          </>
        )}
        <div class="ml-auto flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              class={`font-mono text-[11px] px-2 py-1 rounded-md border ${
                rangeKey === r.key
                  ? 'border-accent text-accent bg-accent-soft'
                  : 'border-line text-muted hover:text-ink hover:bg-surface-2'
              }`}
            >
              {r.key}
            </button>
          ))}
        </div>
      </div>

      <div class="flex gap-1 px-1 pb-2 select-none">
        {[
          { id: null, label: tl('Overview'), href: `#/research/${symbol.toLowerCase()}` },
          { id: 'intraday', label: tl('Chart'), href: `#/research/${symbol.toLowerCase()}/intraday` },
          { id: 'options', label: tl('Options'), href: `#/research/${symbol.toLowerCase()}/options` },
          { id: 'earnings', label: tl('Earnings'), href: `#/research/${symbol.toLowerCase()}/earnings` },
          { id: 'analysts', label: tl('Analysts'), href: `#/research/${symbol.toLowerCase()}/analysts` },
          { id: 'insider', label: tl('Insider'), href: `#/research/${symbol.toLowerCase()}/insider` },
          { id: 'holders', label: tl('Holders'), href: `#/research/${symbol.toLowerCase()}/holders` },
          { id: 'filings', label: tl('Filings'), href: `#/research/${symbol.toLowerCase()}/filings` },
          { id: 'profile', label: tl('Profile'), href: `#/research/${symbol.toLowerCase()}/profile` },
          { id: 'wire', label: tl('Wire'), href: `#/research/${symbol.toLowerCase()}/wire` },
        ].map((tab, ti) => (
          <a
            key={tab.label}
            href={tab.href}
            class={`font-mono text-[11px] px-2.5 py-1 rounded-md border hover:no-underline ${
              route.view === tab.id
                ? 'border-accent text-accent bg-accent-soft'
                : 'border-line text-muted hover:text-ink hover:bg-surface-2'
            }`}
          >
            <span class="opacity-60">{(ti + 1) % 10})</span> {tab.label}
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
      ) : route.view === 'insider' ? (
        <InsiderView symbol={symbol} />
      ) : route.view === 'earnings' ? (
        <EarningsView symbol={symbol} />
      ) : route.view === 'holders' ? (
        <HoldersView symbol={symbol} />
      ) : route.view === 'filings' ? (
        <FilingsView symbol={symbol} />
      ) : route.view === 'wire' ? (
        <SymbolWireView symbol={symbol} />
      ) : route.view === 'profile' ? (
        <ProfileView symbol={symbol} />
      ) : route.view === 'analysts' ? (
        <AnalystsView symbol={symbol} />
      ) : (
        <div class="grid gap-2 xl:grid-cols-[1fr_320px]">
          <section class="bg-surface-1 border border-line rounded-xl min-w-0 overflow-hidden">
            <div class="p-2 pb-0">
            {hist ? (
              <Candles bars={hist.bars} intraday={hist.intraday} />
            ) : (
              <div class="h-[380px] flex items-center justify-center font-mono text-[11px] text-muted">
                {err ? 'no chart' : 'loading…'}
              </div>
            )}
            </div>
            <DesBand symbol={symbol} bars={hist?.bars} />
            <WireMini symbol={symbol} />
          </section>
          <div class="flex flex-col gap-3 min-w-0">
            <AiReport
              label="AI report"
              filename={`${symbol.toLowerCase()}-report.md`}
              buildPrompt={() => buildMemoPrompt(symbol)}
              archive={{ kind: 'memo', symbol, title: `${symbol} memo` }}
            />
            <Technicals symbol={symbol} />
            <Fundamentals symbol={symbol} />
            <News symbol={symbol} />
          </div>
        </div>
      )}
    </div>
  )
}
