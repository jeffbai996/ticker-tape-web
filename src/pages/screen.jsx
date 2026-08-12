import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createChart, LineSeries } from 'lightweight-charts'
import { boundedTimeScale } from '../lib/chartview.js'
import { useQuotes } from '../hooks.js'
import { fetchHistory } from '../lib/history.js'
import { fetchFundamentals } from '../lib/fundamentals.js'
import { macd, rsi, sma } from '../lib/indicators.js'
import { dailyReturns, pearson, normalize } from '../lib/stats.js'
import { fmtPrice, fmtPct, fmtBig, fmtRatio, fmtFracPct } from '../lib/format.js'
import { tl, t as tt } from '../lib/i18n.js'
import { FlashPrice } from '../components/Fig.jsx'
import { Loading } from '../components/Loading.jsx'
import { BUCKETS, SYMBOL_RE } from '../lib/symbols.js'
import { isWatched, watch, unwatch } from '../lib/watchlist.js'
import { loadScreens, saveScreen, deleteScreen, passesScreenFilters } from '../lib/screens.js'

const DEFAULT_SYMBOLS = 'AAPL MSFT NVDA GOOG AMZN SPY'
const LINE_COLORS = ['#f59e0b', '#22d3ee', '#3fb950', '#f85149', '#a78bfa', '#ec4899', '#e7ecf3', '#79828d']

// Eight series is where the compare chart, the correlation grid and the
// valuation table all stay readable — but the cap used to eat symbol nine
// without a word, so a pasted 15-name list silently screened the first eight.
const MAX_SCREEN_SYMBOLS = 8

/** @returns {{symbols: string[], dropped: number}} */
function parseSymbols(raw) {
  const unique = [...new Set(
    raw
      .toUpperCase()
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => SYMBOL_RE.test(s)),
  )]
  const kept = unique.slice(0, MAX_SCREEN_SYMBOLS)
  return { symbols: kept, dropped: unique.length - kept.length }
}

function useHistories(symbols) {
  const [data, setData] = useState({})
  useEffect(() => {
    let alive = true
    setData({})
    for (const sym of symbols) {
      fetchHistory(sym, '1Y')
        .then((h) => alive && setData((d) => ({ ...d, [sym]: h })))
        .catch(() => alive && setData((d) => ({ ...d, [sym]: { error: true } })))
    }
    return () => { alive = false }
  }, [symbols.join(',')])
  return data
}

function SymbolInput({ value, onChange, dropped }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <form
      class="flex gap-2 px-1 pb-3"
      onSubmit={(e) => {
        e.preventDefault()
        onChange(draft)
      }}
    >
      <input
        value={draft}
        onInput={(e) => setDraft(e.target.value)}
        placeholder={tt('screen.placeholder')}
        class="flex-1 max-w-md bg-surface-1 border border-line-2 rounded-lg px-3 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent"
      />
      <button
        type="submit"
        class="bg-accent text-surface-0 font-mono font-bold text-[11px] px-3 rounded-lg hover:brightness-110"
      >
        {tl('Run')}
      </button>
      {/* same "+N" overflow counter the watchlist chip preview uses, so the
          cap reads as "there is more" rather than as an error */}
      {dropped > 0 && (
        <span class="self-center font-mono text-[10px] text-muted whitespace-nowrap"
          title={tt('screen.cap', { max: MAX_SCREEN_SYMBOLS })}>
          +{dropped} {tl('dropped')}
        </span>
      )}
    </form>
  )
}

/** Star cell: screen result → watchlist in one tap, no page hop. */
function WatchCell({ sym }) {
  const [, bump] = useState(0)
  const on = isWatched(sym)
  return (
    <td class="px-1 py-[3px] text-center" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => { (on ? unwatch : watch)(sym); bump((n) => n + 1) }}
        title={on ? tl('on the board') : tl('add to watchlist')}
        class={`w-5 h-5 rounded ${on ? 'text-accent' : 'text-muted hover:text-accent'}`}>
        {on ? '★' : '☆'}
      </button>
    </td>
  )
}

function ScreenTable({ symbols, hist }) {
  // Live 1D quotes for price/day% — the 1Y history fetch reports change vs the
  // range start, not vs yesterday's close.
  const live = useQuotes(symbols)
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto max-w-4xl">
      <table class="w-full border-collapse font-mono text-[12px]">
        <thead>
          <tr class="border-b border-line-2 bg-surface-2 text-[10px] text-muted uppercase tracking-wider">
            <th class="px-1 py-2 w-7"></th>
            <th class="px-3 py-2 text-left">{tl('Sym')}</th>
            <th class="px-2 py-2 text-right">{tl('Price')}</th>
            <th class="px-2 py-2 text-right">{tl('Day %')}</th>
            <th class="px-2 py-2 text-right">{tl('RSI 14')}</th>
            <th class="px-2 py-2 text-right">{tl('vs SMA200')}</th>
            <th class="px-2 py-2 text-right">{tl('52w range')}</th>
            <th class="px-3 py-2 text-right">{tl('1Y %')}</th>
          </tr>
        </thead>
        <tbody>
          {symbols.map((sym) => {
            const h = hist[sym]
            if (h?.error) {
              return (
                <tr key={sym} class="border-b border-line last:border-0">
                  <WatchCell sym={sym} />
                  <td class="px-3 py-[3px] font-bold text-accent">{sym}</td>
                  <td colSpan={6} class="px-2 py-[3px] text-down text-[11px]">{tl('no data')}</td>
                </tr>
              )
            }
            const closes = h?.bars?.map((b) => b.close) || []
            const q = live[sym]?.quote
            const price = q?.price ?? closes[closes.length - 1]
            const r = rsi(closes, 14)
            const s200 = sma(closes, 200)
            const vs200 = s200 && price ? ((price / s200 - 1) * 100) : null
            const lo = closes.length ? Math.min(...closes) : null
            const hi = closes.length ? Math.max(...closes) : null
            const pos52 = lo != null && hi > lo ? ((price - lo) / (hi - lo)) * 100 : null
            const y1 = closes.length > 1 ? (price / closes[0] - 1) * 100 : null
            const dayUp = (q?.pct ?? 0) >= 0
            return (
              <tr
                key={sym}
                class="border-b border-line last:border-0 hover:bg-surface-3 cursor-pointer"
                onClick={() => (location.hash = `#/research/${sym.toLowerCase()}`)}
              >
                <WatchCell sym={sym} />
                <td class="px-3 py-[3px] font-bold text-accent">{sym}</td>
                <td class="px-2 py-[3px] text-right text-ink">{q ? <FlashPrice price={price} fmt={fmtPrice} /> : '…'}</td>
                <td class={`px-2 py-[3px] text-right ${dayUp ? 'text-up' : 'text-down'}`}>
                  {q ? fmtPct(q.pct) : ''}
                </td>
                <td class={`px-2 py-[3px] text-right ${r == null ? 'text-muted' : r >= 70 ? 'text-down' : r <= 30 ? 'text-up' : 'text-ink'}`}>
                  {r == null ? '—' : r.toFixed(1)}
                </td>
                <td class={`px-2 py-[3px] text-right ${vs200 == null ? 'text-muted' : vs200 >= 0 ? 'text-up' : 'text-down'}`}>
                  {vs200 == null ? '—' : fmtPct(vs200)}
                </td>
                <td class="px-2 py-[3px] text-right text-ink-2">
                  {pos52 == null ? '—' : `${pos52.toFixed(0)}%`}
                </td>
                <td class={`px-3 py-[3px] text-right ${y1 == null ? 'text-muted' : y1 >= 0 ? 'text-up' : 'text-down'}`}>
                  {y1 == null ? '—' : fmtPct(y1)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Compare({ symbols, hist }) {
  const el = useRef(null)

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
      timeScale: boundedTimeScale(false),
    })
    symbols.forEach((sym, i) => {
      const h = hist[sym]
      if (!h?.bars?.length) return
      const norm = normalize(h.bars.map((b) => b.close))
      const series = chart.addSeries(LineSeries, {
        color: LINE_COLORS[i % LINE_COLORS.length],
        lineWidth: 1.6,
        priceFormat: { type: 'custom', formatter: (v) => `${v.toFixed(1)}%` },
      })
      series.setData(h.bars.map((b, j) => ({ time: b.time, value: norm[j] })))
    })
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [symbols.join(','), Object.keys(hist).length])

  return (
    <section class="bg-surface-1 border border-line rounded-xl p-2 max-w-4xl">
      <div class="flex gap-3 px-2 pb-1 font-mono text-[11px] flex-wrap">
        {symbols.map((sym, i) => (
          <span key={sym} style={{ color: LINE_COLORS[i % LINE_COLORS.length] }}>■ {sym}</span>
        ))}
        <span class="text-muted ml-auto">1Y normalized %</span>
      </div>
      <div ref={el} class="h-[420px] w-full" />
    </section>
  )
}

function corColor(v) {
  if (v == null) return 'text-muted'
  if (v >= 0.8) return 'text-down'
  if (v >= 0.5) return 'text-accent'
  if (v >= 0) return 'text-ink-2'
  return 'text-up'
}

function Correlation({ symbols, hist }) {
  const returns = useMemo(() => {
    const out = {}
    for (const sym of symbols) {
      const closes = hist[sym]?.bars?.map((b) => b.close)
      if (closes?.length > 30) out[sym] = dailyReturns(closes)
    }
    return out
  }, [symbols.join(','), Object.keys(hist).length])

  const ready = symbols.filter((s) => returns[s])

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto max-w-4xl">
      <table class="border-collapse font-mono text-[11px]">
        <thead>
          <tr class="bg-surface-2 text-[10px] text-muted">
            <th class="px-3 py-2"></th>
            {ready.map((s) => (
              <th key={s} class="px-3 py-2 text-accent">{s}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ready.map((a) => (
            <tr key={a} class="border-t border-line">
              <td class="px-3 py-[6px] font-bold text-accent bg-surface-2">{a}</td>
              {ready.map((b) => {
                const v = a === b ? 1 : pearson(returns[a], returns[b])
                return (
                  <td key={b} class={`px-3 py-[6px] text-center ${corColor(v)}`}>
                    {v == null ? '—' : v.toFixed(2)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div class="px-3 py-2 border-t border-line font-mono text-[10px] text-muted">
        1Y daily returns · <span class="text-down">≥0.80 high</span> · <span class="text-accent">≥0.50 moderate</span> · <span class="text-up">&lt;0 diversifying</span>
      </div>
    </section>
  )
}

const VAL_ROWS = [
  { label: 'Mkt cap', fmt: (f) => fmtBig(f.marketCap) },
  { label: 'P/E ttm', fmt: (f) => fmtRatio(f.trailingPE) },
  { label: 'P/E fwd', fmt: (f) => fmtRatio(f.forwardPE) },
  { label: 'P/S ttm', fmt: (f) => fmtRatio(f.priceToSalesTrailing12Months) },
  { label: 'PEG', fmt: (f) => fmtRatio(f.pegRatio) },
  { label: 'EV/EBITDA', fmt: (f) => fmtRatio(f.enterpriseToEbitda) },
  { label: 'P/B', fmt: (f) => fmtRatio(f.priceToBook) },
  { label: 'Gross mgn', fmt: (f) => fmtFracPct(f.grossMargins) },
  { label: 'Net mgn', fmt: (f) => fmtFracPct(f.profitMargins) },
  { label: 'ROE', fmt: (f) => fmtFracPct(f.returnOnEquity) },
  { label: 'Rev growth', fmt: (f) => fmtFracPct(f.revenueGrowth) },
  { label: 'Div yield', fmt: (f) => fmtFracPct(f.dividendYield) },
  { label: 'Beta', fmt: (f) => fmtRatio(f.beta) },
]

function Valuation({ symbols }) {
  const [funds, setFunds] = useState({})
  // fundamental bands: pass/fail wash over the columns, not a hidden cull —
  // with an 8-name set you want to SEE what missed and by how much
  const [bands, setBandsState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('screen_bands_v1')) || {} } catch { return {} }
  })
  const setBand = (k, v) => {
    const next = { ...bands, [k]: v }
    setBandsState(next)
    localStorage.setItem('screen_bands_v1', JSON.stringify(next))
  }

  useEffect(() => {
    let alive = true
    setFunds({})
    for (const sym of symbols) {
      fetchFundamentals(sym)
        .then((f) => alive && setFunds((d) => ({ ...d, [sym]: f })))
        .catch(() => alive && setFunds((d) => ({ ...d, [sym]: { error: true } })))
    }
    return () => { alive = false }
  }, [symbols.join(',')])

  const ready = symbols.filter((s) => funds[s] && !funds[s].error)
  const verdicts = Object.fromEntries(ready.map((s) => [s, passesScreenFilters(funds[s], bands)]))
  const active = ['peMax', 'growthMin', 'marginMin'].some((k) => bands[k] != null && bands[k] !== '')
  const passN = ready.filter((s) => verdicts[s] === true).length

  const bandField = (key, label) => (
    <label class="flex items-center gap-1">
      <span class="text-[9px] uppercase tracking-wider text-muted">{label}</span>
      <input value={bands[key] ?? ''} inputMode="decimal"
        onInput={(e) => setBand(key, e.currentTarget.value)}
        class="w-14 bg-surface-2 border border-line rounded px-1.5 py-0.5 text-ink text-right outline-none focus:border-accent" />
    </label>
  )

  return (
    <>
    <div class="flex items-center gap-3 flex-wrap px-1 pb-2 font-mono text-[10px]">
      {bandField('peMax', `${tl('fwd P/E')} ≤`)}
      {bandField('growthMin', `${tl('rev growth')} ≥ %`)}
      {bandField('marginMin', `${tl('net margin')} ≥ %`)}
      {active && (
        <span class="text-ink-2">{passN}/{ready.length} {tl('pass')}</span>
      )}
    </div>
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto max-w-4xl">
      <table class="border-collapse font-mono text-[11px] w-full">
        <thead>
          <tr class="bg-surface-2 text-[10px] text-muted">
            <th class="px-3 py-2 text-left"></th>
            {ready.map((s) => (
              <th
                key={s}
                class={`px-3 py-2 text-right cursor-pointer hover:underline ${
                  !active ? 'text-accent'
                    : verdicts[s] === true ? 'text-up'
                    : verdicts[s] === false ? 'text-down/70 line-through decoration-1'
                    : 'text-muted'}`}
                title={!active ? undefined : verdicts[s] === true ? tl('pass')
                  : verdicts[s] === false ? tl('fails a band') : tl('missing data')}
                onClick={() => (location.hash = `#/research/${s.toLowerCase()}`)}
              >
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {VAL_ROWS.map((row) => (
            <tr key={row.label} class="border-t border-line hover:bg-surface-3">
              <td class="px-3 py-[3px] text-muted whitespace-nowrap">{row.label}</td>
              {ready.map((s) => (
                <td key={s} class="px-3 py-[3px] text-right text-ink">{row.fmt(funds[s])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {ready.length === 0 && (
        <Loading label="loading fundamentals… (indices/futures/crypto have none)" minH={120} />
      )}
    </section>
    </>
  )
}

/** CLI parity: the rsi / sma_cross / vol screens as one sortable sheet. */
function TechScreen({ symbols, hist }) {
  const [sortKey, setSortKey] = useState('rsi')
  const rows = symbols.map((sym) => {
    const bars = hist[sym]?.bars || []
    const closes = bars.map((b) => b.close)
    const price = closes[closes.length - 1] ?? null
    const s50 = sma(closes, 50)
    const s200 = sma(closes, 200)
    const r = rsi(closes, 14)
    const m = macd(closes)
    const vols = bars.map((b) => b.volume || 0)
    const v20 = vols.length > 21 ? vols.slice(-21, -1).reduce((a, b) => a + b, 0) / 20 : null
    const volX = v20 ? (vols[vols.length - 1] || 0) / v20 : null
    const hi = closes.length ? Math.max(...closes) : null
    // golden/death cross within the last 10 sessions
    let cross = null
    if (closes.length > 210) {
      const smaAt = (n, back) => {
        const seg = closes.slice(closes.length - n - back, closes.length - back)
        return seg.reduce((a, b) => a + b, 0) / n
      }
      const nowDiff = s50 - s200
      const thenDiff = smaAt(50, 10) - smaAt(200, 10)
      if (nowDiff > 0 && thenDiff <= 0) cross = 'golden'
      else if (nowDiff < 0 && thenDiff >= 0) cross = 'death'
    }
    return {
      sym, price, rsi: r, s50, s200, volX, cross,
      offHigh: hi && price ? ((price / hi) - 1) * 100 : null,
      macdHist: m?.hist ?? null,
    }
  }).filter((r) => r.price != null)
  const sorters = {
    rsi: (a, b) => (b.rsi ?? -1) - (a.rsi ?? -1),
    volX: (a, b) => (b.volX ?? -1) - (a.volX ?? -1),
    offHigh: (a, b) => (a.offHigh ?? 1) - (b.offHigh ?? 1),
    macdHist: (a, b) => (b.macdHist ?? -1e9) - (a.macdHist ?? -1e9),
  }
  rows.sort(sorters[sortKey] || sorters.rsi)
  const th = (key, label) => (
    <th class={`px-2 py-1.5 text-right cursor-pointer select-none ${sortKey === key ? 'text-accent' : ''}`}
      onClick={() => setSortKey(key)}>{label}{sortKey === key ? ' ▾' : ''}</th>
  )
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto max-w-4xl mt-2">
      <table class="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
            <th class="px-3 py-1.5 text-left">{tl('sym')}</th>
            <th class="px-2 py-1.5 text-right">{tl('px')}</th>
            {th('rsi', tl('rsi14'))}
            <th class="px-2 py-1.5 text-right">{tl('vs 50d')}</th>
            <th class="px-2 py-1.5 text-right">{tl('vs 200d')}</th>
            <th class="px-2 py-1.5 text-center">{tl('cross')}</th>
            {th('volX', tl('vol x20d'))}
            {th('offHigh', tl('off high'))}
            {th('macdHist', tl('macd'))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sym} class="border-t border-line hover:bg-surface-3 cursor-pointer"
              onClick={() => (location.hash = `#/research/${r.sym.toLowerCase()}`)}>
              <td class="px-3 py-[3px] font-[650] font-tick text-ink">{r.sym}</td>
              <td class="px-2 py-[3px] text-right text-ink-2">{r.price.toFixed(2)}</td>
              <td class={`px-2 py-[3px] text-right font-semibold ${r.rsi == null ? 'text-muted' : r.rsi >= 70 ? 'text-down' : r.rsi <= 30 ? 'text-up' : 'text-ink-2'}`}>
                {r.rsi != null ? r.rsi.toFixed(1) : '—'}
              </td>
              {[r.s50, r.s200].map((v, i) => {
                const d = v ? ((r.price / v) - 1) * 100 : null
                return <td key={i} class={`px-2 py-[3px] text-right ${d == null ? 'text-muted' : d >= 0 ? 'text-up' : 'text-down'}`}>
                  {d == null ? '—' : `${d >= 0 ? '+' : ''}${d.toFixed(1)}%`}</td>
              })}
              <td class="px-2 py-[3px] text-center">
                {r.cross === 'golden' && <span class="text-up font-bold text-[10px]">{tl('GOLDEN')}</span>}
                {r.cross === 'death' && <span class="text-down font-bold text-[10px]">{tl('DEATH')}</span>}
              </td>
              <td class={`px-2 py-[3px] text-right ${r.volX != null && r.volX >= 2 ? 'text-accent font-semibold' : 'text-ink-2'}`}>
                {r.volX != null ? `${r.volX.toFixed(1)}x` : '—'}
              </td>
              <td class={`px-2 py-[3px] text-right ${r.offHigh != null && r.offHigh <= -15 ? 'text-down' : 'text-ink-2'}`}>
                {r.offHigh != null ? `${r.offHigh.toFixed(0)}%` : '—'}
              </td>
              <td class={`px-2 py-[3px] text-right ${r.macdHist == null ? 'text-muted' : r.macdHist >= 0 ? 'text-up' : 'text-down'}`}>
                {r.macdHist != null ? r.macdHist.toFixed(2) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Saved screens + sector presets: one tap loads a named symbol set. */
function PresetRow({ current, onLoad }) {
  const [screens, setScreens] = useState(loadScreens)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const save = (e) => {
    e.preventDefault()
    if (!name.trim()) { setNaming(false); return }
    saveScreen(name, current)
    setScreens(loadScreens())
    setNaming(false)
    setName('')
  }
  return (
    <div class="flex items-center gap-1.5 flex-wrap px-1 pb-2 font-mono text-[10px]">
      {screens.map((s) => (
        <span key={s.name} class="group inline-flex items-center gap-1 border border-accent/40 rounded-full pl-2 pr-1 py-px">
          <button onClick={() => onLoad(s.symbols)} class="text-accent hover:brightness-125">{s.name}</button>
          <button onClick={() => { deleteScreen(s.name); setScreens(loadScreens()) }}
            title={tl('delete')}
            class="opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 text-muted hover:text-down">✕</button>
        </span>
      ))}
      {naming ? (
        <form onSubmit={save} class="inline-flex">
          <input autoFocus value={name} onInput={(e) => setName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNaming(false)}
            onBlur={() => { if (!name.trim()) setNaming(false) }}
            placeholder={tl('screen name')}
            class="w-24 bg-surface-2 border border-accent/60 rounded-full px-2 py-px text-ink outline-none placeholder:text-muted" />
        </form>
      ) : (
        <button onClick={() => setNaming(true)}
          class="border border-dashed border-line-2 rounded-full px-2 py-px text-muted hover:text-accent hover:border-accent/60">
          + {tl('save screen')}
        </button>
      )}
      <span class="w-px h-3.5 bg-line-2 mx-1" />
      {BUCKETS.map((b) => (
        <button key={b.name} onClick={() => onLoad(b.symbols.join(' '))}
          class="border border-line rounded-full px-2 py-px text-ink-2 hover:text-accent-2 hover:border-accent-2/50 uppercase tracking-wider text-[9px]">
          {tl(b.name)}
        </button>
      ))}
    </div>
  )
}

export function Screen({ route }) {
  const view = route.sub || 'screen'
  const [raw, setRaw] = useState(() => localStorage.getItem('screen_symbols') || DEFAULT_SYMBOLS)
  const { symbols, dropped } = useMemo(() => parseSymbols(raw), [raw])
  const hist = useHistories(symbols)

  const update = (v) => {
    setRaw(v)
    localStorage.setItem('screen_symbols', v)
  }

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <SymbolInput value={raw} onChange={update} dropped={dropped} />
      <PresetRow current={raw} onLoad={update} />
      {view === 'screen' && <ScreenTable symbols={symbols} hist={hist} />}
      {view === 'compare' && <Compare symbols={symbols} hist={hist} />}
      {view === 'technicals' && <TechScreen symbols={symbols} hist={hist} />}
      {view === 'correlation' && <Correlation symbols={symbols} hist={hist} />}
      {view === 'valuation' && <Valuation symbols={symbols} />}
    </div>
  )
}
