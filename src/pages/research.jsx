import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, CandlestickSeries } from 'lightweight-charts'
import { useQuotes } from '../hooks.js'
import { fetchHistory, fetchNews, RANGES } from '../lib/history.js'
import { fetchFundamentals } from '../lib/fundamentals.js'
import { fetchOptions } from '../lib/options.js'
import { fetchInsider } from '../lib/fundamentals.js'
import { fetchEarningsImpact } from '../lib/earnings.js'
import { bsDelta } from '../lib/bs.js'
import { vwapSeries } from '../lib/vwap.js'
import { LineSeries } from 'lightweight-charts'
import { sma, rsi, macd, bollinger } from '../lib/indicators.js'
import { fmtPrice, fmtPct, fmtChange, fmtVol, fmtBig, fmtRatio, fmtFracPct } from '../lib/format.js'
import { hrefFor } from '../lib/route.js'

function Candles({ bars, intraday }) {
  const el = useRef(null)
  const chartRef = useRef(null)

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
    chartRef.current = { chart, series }
    return () => chart.remove()
  }, [intraday])

  useEffect(() => {
    if (!chartRef.current || !bars) return
    chartRef.current.series.setData(bars)
    chartRef.current.chart.timeScale().fitContent()
  }, [bars])

  return <div ref={el} class="h-[380px] w-full" />
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
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">Technicals — daily</h2>
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
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2 flex items-baseline gap-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">Fundamentals</h2>
        {f?.recommendationKey && (
          <span class="font-mono text-[10px] text-ink-2 uppercase">{f.recommendationKey.replace('_', ' ')}</span>
        )}
      </header>
      {!f && <div class="px-3 py-3 text-[11px] text-muted font-mono">loading…</div>}
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
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">News</h2>
      </header>
      {items == null && <div class="px-3 py-3 text-[11px] text-muted font-mono">loading…</div>}
      {items?.length === 0 && <div class="px-3 py-3 text-[11px] text-muted font-mono">no headlines</div>}
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
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
      </header>
      <div class="overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="text-[9px] text-muted uppercase tracking-wider bg-surface-2/60">
              <th class="px-2 py-1.5 text-right">Strike</th>
              <th class="px-2 py-1.5 text-right">Last</th>
              <th class="px-2 py-1.5 text-right">Bid</th>
              <th class="px-2 py-1.5 text-right">Ask</th>
              <th class="px-2 py-1.5 text-right">IV</th>
              <th class="px-2 py-1.5 text-right">Δ</th>
              <th class="px-2 py-1.5 text-right">Vol</th>
              <th class="px-2 py-1.5 text-right">OI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const delta = bsDelta({ spot, strike: c.strike, t, iv: c.iv, type })
              return (
                <tr
                  key={c.strike}
                  class={`border-t border-line ${c.itm ? 'bg-accent-soft/40' : ''} hover:bg-surface-2`}
                >
                  <td class="px-2 py-[3px] text-right font-bold text-ink">{fmtPrice(c.strike)}</td>
                  <td class="px-2 py-[3px] text-right text-ink">{c.last != null ? fmtPrice(c.last) : '—'}</td>
                  <td class="px-2 py-[3px] text-right text-ink-2">{c.bid != null ? fmtPrice(c.bid) : '—'}</td>
                  <td class="px-2 py-[3px] text-right text-ink-2">{c.ask != null ? fmtPrice(c.ask) : '—'}</td>
                  <td class="px-2 py-[3px] text-right text-ink-2">
                    {c.iv != null ? `${(c.iv * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td class="px-2 py-[3px] text-right text-ink-2">
                    {delta != null ? delta.toFixed(2) : '—'}
                  </td>
                  <td class="px-2 py-[3px] text-right text-muted">{c.volume ?? '—'}</td>
                  <td class="px-2 py-[3px] text-right text-muted">{c.oi ?? '—'}</td>
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
            spot <span class="text-ink">{fmtPrice(chain.spot)}</span> · shaded = ITM · Δ via Black-Scholes from IV
          </span>
        )}
      </div>
      <div class="grid gap-3 xl:grid-cols-2">
        <OptionSide title="Calls" rows={near(chain.calls)} spot={chain.spot} t={t} type="call" />
        <OptionSide title="Puts" rows={near(chain.puts)} spot={chain.spot} t={t} type="put" />
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
        no insider data for {symbol} (ETFs/indices/crypto have none)
      </div>
    )
  }
  if (!rows) return <div class="px-1 font-mono text-[11px] text-muted">loading…</div>

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto max-w-4xl">
      <table class="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
            <th class="px-3 py-2 text-left">Date</th>
            <th class="px-2 py-2 text-left">Insider</th>
            <th class="px-2 py-2 text-left">Role</th>
            <th class="px-2 py-2 text-left">Transaction</th>
            <th class="px-2 py-2 text-right">Shares</th>
            <th class="px-3 py-2 text-right">Value</th>
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
        no earnings history for {symbol} (ETFs/indices/crypto have none)
      </div>
    )
  }
  if (!data) return <div class="px-1 font-mono text-[11px] text-muted">loading…</div>
  if (!data.events.length) {
    return <div class="px-1 font-mono text-[11px] text-muted">no reported quarters for {symbol}</div>
  }

  const s = data.summary
  const pctTone = (v) => (v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down')

  return (
    <div class="flex flex-col gap-3 max-w-4xl">
      <section class="bg-surface-1 border border-line rounded-xl flex flex-wrap divide-x divide-line">
        <SummaryStat
          label="Beat rate"
          value={s.beatRate != null ? `${Math.round(s.beatRate * 100)}% (${s.beats}/${s.total})` : '—'}
        />
        <SummaryStat label="Beat streak" value={`${s.beatStreak}q`} />
        <SummaryStat
          label="Avg surprise"
          value={s.avgSurprise != null ? fmtPct(s.avgSurprise * 100) : '—'}
          tone={pctTone(s.avgSurprise)}
        />
        <SummaryStat
          label="Avg reaction"
          value={s.avgMove != null ? fmtPct(s.avgMove) : '—'}
          tone={pctTone(s.avgMove)}
        />
      </section>

      <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
        <table class="w-full border-collapse font-mono text-[11px]">
          <thead>
            <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
              <th class="px-3 py-2 text-left">Quarter</th>
              <th class="px-2 py-2 text-left">Reported</th>
              <th class="px-2 py-2 text-right">EPS est</th>
              <th class="px-2 py-2 text-right">EPS act</th>
              <th class="px-2 py-2 text-right">Surprise</th>
              <th class="px-2 py-2 text-right">Reaction</th>
              <th class="px-3 py-2 text-left">Peers</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((e) => (
              <tr key={e.quarter} class="border-t border-line hover:bg-surface-2">
                <td class="px-3 py-[5px] text-ink-2 whitespace-nowrap">
                  {new Date(e.quarter).toISOString().slice(0, 10)}
                </td>
                <td class="px-2 py-[5px] text-muted whitespace-nowrap">
                  {e.report ? new Date(e.report).toISOString().slice(0, 10) : '—'}
                </td>
                <td class="px-2 py-[5px] text-right text-ink-2">{e.epsEstimate != null ? e.epsEstimate.toFixed(2) : '—'}</td>
                <td class="px-2 py-[5px] text-right text-ink">{e.epsActual.toFixed(2)}</td>
                <td class={`px-2 py-[5px] text-right ${pctTone(e.surprisePct)}`}>
                  {e.surprisePct != null ? fmtPct(e.surprisePct * 100) : '—'}
                </td>
                <td class={`px-2 py-[5px] text-right ${pctTone(e.priceMove)}`}>
                  {e.priceMove != null ? fmtPct(e.priceMove) : '—'}
                </td>
                <td class="px-3 py-[5px] whitespace-nowrap">
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
          reaction = close-to-close around the report date · dashes = Yahoo's calendar lacks the date
        </div>
      </section>
    </div>
  )
}

function SymbolPrompt() {
  const [value, setValue] = useState('')
  const go = (e) => {
    e.preventDefault()
    const sym = value.trim().toUpperCase()
    if (sym) location.hash = hrefFor('research', sym.toLowerCase())
  }
  return (
    <div class="flex-1 flex items-center justify-center p-8">
      <form onSubmit={go} class="w-full max-w-sm bg-surface-1 border border-line rounded-2xl p-6">
        <h1 class="text-base font-semibold text-ink mb-3">Research a symbol</h1>
        <div class="flex gap-2">
          <input
            value={value}
            onInput={(e) => setValue(e.target.value)}
            placeholder="NVDA, SPY, BTC-USD…"
            class="flex-1 bg-surface-0 border border-line-2 rounded-lg px-3 py-2 font-mono text-[13px] text-ink outline-none focus:border-accent"
          />
          <button
            type="submit"
            class="bg-accent text-surface-0 font-mono font-bold text-[12px] px-4 rounded-lg hover:opacity-90"
          >
            GO
          </button>
        </div>
      </form>
    </div>
  )
}

export function Research({ route }) {
  const symbol = route.sub
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

  if (!symbol) return <SymbolPrompt />

  const q = live[symbol]?.quote
  const up = (q?.pct ?? 0) >= 0

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <div class="flex items-baseline gap-3 px-1 pb-2 flex-wrap">
        <h1 class="font-mono font-bold text-lg text-ink">{symbol}</h1>
        {q && (
          <>
            <span class="text-[12px] text-muted">{q.name}</span>
            <span class="font-mono text-lg text-ink">{fmtPrice(q.price)}</span>
            <span class={`font-mono text-[13px] ${up ? 'text-up' : 'text-down'}`}>
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

      <div class="flex gap-1 px-1 pb-2">
        {[
          { id: null, label: 'Overview', href: `#/research/${symbol.toLowerCase()}` },
          { id: 'intraday', label: 'Intraday', href: `#/research/${symbol.toLowerCase()}/intraday` },
          { id: 'options', label: 'Options', href: `#/research/${symbol.toLowerCase()}/options` },
          { id: 'earnings', label: 'Earnings', href: `#/research/${symbol.toLowerCase()}/earnings` },
          { id: 'insider', label: 'Insider', href: `#/research/${symbol.toLowerCase()}/insider` },
        ].map((tab) => (
          <a
            key={tab.label}
            href={tab.href}
            class={`font-mono text-[11px] px-2.5 py-1 rounded-md border hover:no-underline ${
              route.view === tab.id
                ? 'border-accent text-accent bg-accent-soft'
                : 'border-line text-muted hover:text-ink hover:bg-surface-2'
            }`}
          >
            {tab.label}
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
        <IntradayView symbol={symbol} />
      ) : route.view === 'insider' ? (
        <InsiderView symbol={symbol} />
      ) : route.view === 'earnings' ? (
        <EarningsView symbol={symbol} />
      ) : (
        <div class="grid gap-3 xl:grid-cols-[1fr_320px]">
          <section class="bg-surface-1 border border-line rounded-xl p-2 min-w-0">
            {hist ? (
              <Candles bars={hist.bars} intraday={hist.intraday} />
            ) : (
              <div class="h-[380px] flex items-center justify-center font-mono text-[11px] text-muted">
                {err ? 'no chart' : 'loading…'}
              </div>
            )}
          </section>
          <div class="flex flex-col gap-3 min-w-0">
            <Technicals symbol={symbol} />
            <Fundamentals symbol={symbol} />
            <News symbol={symbol} />
          </div>
        </div>
      )}
    </div>
  )
}
