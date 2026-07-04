import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, AreaSeries } from 'lightweight-charts'
import { useQuotes, useWatchlist } from '../hooks.js'
import { BUCKETS } from '../lib/symbols.js'
import { pulseStats } from '../lib/pulse.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { ECON_EVENTS, upcomingEvents } from '../lib/markets.js'
import { lastGoodTs } from '../lib/feed.js'
import { fetchHistory } from '../lib/history.js'
import {
  getWidgets, addWidget, removeWidget, moveWidget, onWidgetsChange, WIDGET_TYPES,
} from '../lib/widgets.js'
import { fmtPrice, fmtPct, fmtChange, fmtVol } from '../lib/format.js'
import { Histo } from '../components/Histo.jsx'
import { tl } from '../lib/i18n.js'

const DAY = 86_400_000
const ETF_SKIP = new Set(['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'])

/** Days until each symbol's next earnings — feeds the `27d` badge + panel.
 *  Exported for the briefing page, which reuses the same fan-out. */
export function useEarningsDays(symbols) {
  const [rows, setRows] = useState({})
  useEffect(() => {
    let alive = true
    const timers = []
    // Staggered: 30 simultaneous v10 calls on a cold cache stampede the
    // worker's crumb auth. Cached symbols resolve instantly regardless.
    symbols.filter((s) => !ETF_SKIP.has(s)).forEach((sym, i) => {
      timers.push(setTimeout(() => {
        if (!alive) return
        fetchEarningsDate(sym)
          .then((v) => alive && setRows((r) => ({ ...r, [sym]: v })))
          .catch(() => {})
      }, i * 120))
    })
    return () => { alive = false; timers.forEach(clearTimeout) }
  }, [symbols.join(',')])

  const days = {}
  const now = Date.now()
  for (const [sym, v] of Object.entries(rows)) {
    if (v?.date && v.date >= now - DAY) days[sym] = Math.max(0, Math.round((v.date - now) / DAY))
  }
  return days
}

// ── Badge row (TUI line 2): R60 27d >50 >200 1.1xv -2%H +3%R ──

function Badges({ tech, earnDays }) {
  if (!tech) return <span class="text-muted text-[10px]">…</span>
  const r = tech.rsi
  const rsiCls = r == null ? 'text-muted' : r >= 70 || r <= 30 ? 'text-accent' : 'text-ink-2'
  const smaBadge = (above, n) =>
    above == null ? null : (
      <span class={above ? 'text-up' : 'text-down'}>{above ? '>' : '<'}{n}</span>
    )
  return (
    <div class="flex items-baseline gap-2.5 font-mono text-[10px] whitespace-nowrap">
      <span class={rsiCls}>{r != null ? `R${Math.round(r)}` : ''}</span>
      {earnDays != null && <span class="text-accent">{earnDays}d</span>}
      {smaBadge(tech.above50, 50)}
      {smaBadge(tech.above200, 200)}
      {tech.volRatio != null && (
        <span class={tech.volRatio >= 1.5 ? 'text-accent' : 'text-muted'}>
          {tech.volRatio.toFixed(1)}xv
        </span>
      )}
      {tech.offHigh != null && (
        <span class={tech.offHigh <= -15 ? 'text-down' : 'text-ink-2'}>
          {Math.round(tech.offHigh)}%H
        </span>
      )}
      {tech.rs != null && (
        <span class={tech.rs >= 0 ? 'text-up' : 'text-down'}>
          {tech.rs >= 0 ? '+' : ''}{Math.round(tech.rs)}%R
        </span>
      )}
    </div>
  )
}

function TuiRow({ symbol, data, earnDays }) {
  const q = data?.quote
  const up = (q?.pct ?? 0) >= 0
  const extUp = (q?.extPct ?? 0) >= 0
  return (
    <a
      href={`#/research/${symbol.toLowerCase()}`}
      class="block px-3 py-[5px] border-b border-line last:border-0 hover:bg-surface-2 hover:no-underline"
    >
      <div class="flex items-baseline gap-3 font-mono text-[12px] flex-wrap">
        <span class="text-ink font-bold w-16">{symbol}</span>
        <span class="text-ink w-20 text-right">{q ? fmtPrice(q.price) : '—'}</span>
        {q && (
          <span class={`${up ? 'text-up' : 'text-down'} whitespace-nowrap`}>
            {up ? '▲' : '▼'} {fmtChange(Math.abs(q.change)).replace('+', '')} ({fmtPct(q.pct)})
          </span>
        )}
        {q?.extLabel && q.extPrice != null && (
          <span class="whitespace-nowrap text-[11px]">
            <span class="text-[#c084fc]">{q.extLabel}</span>{' '}
            <span class="text-ink-2">{fmtPrice(q.extPrice)}</span>{' '}
            <span class={extUp ? 'text-up' : 'text-down'}>
              {extUp ? '▲' : '▼'}{Math.abs(q.extPct ?? 0).toFixed(1)}%
            </span>
          </span>
        )}
        {q?.volume != null && (
          <span class="text-muted text-[10px] ml-auto hidden sm:inline">{fmtVol(q.volume)}</span>
        )}
      </div>
      <div class="flex items-center gap-3 pt-[2px] pl-16 max-sm:pl-0">
        <Histo bars={data?.histo} />
        <Badges tech={data?.tech} earnDays={earnDays} />
      </div>
    </a>
  )
}

// ── Right rail: Pulse + Earnings, mirroring the TUI's left column ──

function PulseRow({ label, value, cls = 'text-ink' }) {
  return (
    <div class="flex justify-between px-3 py-[2px] font-mono text-[11px]">
      <span class="text-muted">{label}</span>
      <span class={cls}>{value}</span>
    </div>
  )
}

function PulsePanel({ quotes }) {
  const s = pulseStats(quotes)
  if (!s) return null
  const tone = (v) => (v >= 0 ? 'text-up' : 'text-down')
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Pulse')}</h2>
      </header>
      <div class="py-1">
        <PulseRow label="A/D" value={`${s.adv} / ${s.dec}`} cls={s.adv >= s.dec ? 'text-up' : 'text-down'} />
        <PulseRow label={tl('Avg')} value={fmtPct(s.avg)} cls={tone(s.avg)} />
        <PulseRow label={tl('Hi')} value={`${s.hi.symbol} ${fmtPct(s.hi.pct)}`} cls="text-up" />
        <PulseRow label={tl('Lo')} value={`${s.lo.symbol} ${fmtPct(s.lo.pct)}`} cls="text-down" />
        <PulseRow label={tl('Spd')} value={`${s.spread.toFixed(1)}pp`} />
        <PulseRow label={`⚠ ${tl('down')} >3%`} value={String(s.stress)} cls={s.stress ? 'text-down' : 'text-ink-2'} />
        {(s.extAdv > 0 || s.extDec > 0) && (
          <PulseRow label="ExtHr" value={`${s.extAdv} / ${s.extDec}`} cls={s.extAdv >= s.extDec ? 'text-up' : 'text-down'} />
        )}
        <PulseRow label={tl('Median')} value={fmtPct(s.median)} cls={tone(s.median)} />
        <PulseRow label={tl('Green')} value={`${Math.round(s.greenPct)}%`} cls={tone(s.greenPct - 50)} />
        <PulseRow label="σ" value={s.sigma.toFixed(2)} />
        <PulseRow label="Mov >2%" value={`${s.movers}/${s.total}`} />
        <PulseRow label="Flt <1%" value={String(s.flat)} />
      </div>
    </section>
  )
}

const ECON_COLORS = {
  FOMC: 'text-down', CPI: 'text-accent', NFP: 'text-accent',
  GDP: 'text-[#00c8ff]', PCE: 'text-[#c084fc]',
}

function MacroCalPanel() {
  const events = upcomingEvents(ECON_EVENTS, new Date().toISOString().slice(0, 10), 60).slice(0, 8)
  if (!events.length) return null
  const dayCls = (d) =>
    d <= 3 ? 'text-down font-bold' : d <= 7 ? 'text-down' : d <= 30 ? 'text-accent' : 'text-muted'
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <a href="#/markets/calendar" class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase hover:no-underline">
          {tl('Calendar')}
        </a>
      </header>
      <div class="py-1">
        {events.map((e) => (
          <div key={`${e.date}-${e.type}`} class="flex items-baseline gap-2 px-3 py-[2px] font-mono text-[11px]">
            <span class={`w-10 font-bold ${ECON_COLORS[e.type] || 'text-ink-2'}`}>{e.type}</span>
            <span class="text-muted flex-1 truncate">{tl(e.label)}</span>
            <span class={dayCls(e.days)}>{e.days === 0 ? tl('today') : `${e.days}d`}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function EarningsPanel({ symbols, days }) {
  const upcoming = symbols
    .filter((s) => days[s] != null)
    .map((s) => ({ symbol: s, d: days[s] }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 9)
  if (!upcoming.length) return null
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Earnings')}</h2>
      </header>
      <div class="py-1">
        {upcoming.map(({ symbol, d }) => (
          <a key={symbol} href={`#/research/${symbol.toLowerCase()}/earnings`}
            class="flex justify-between px-3 py-[2px] font-mono text-[11px] hover:bg-surface-2 hover:no-underline">
            <span class="text-ink font-bold">{symbol}</span>
            <span class={d <= 7 ? 'text-down' : d <= 21 ? 'text-accent' : 'text-ink-2'}>{d}d</span>
          </a>
        ))}
      </div>
    </section>
  )
}

// ── Customizable widget rail ──

function MoversPanel({ quotes }) {
  const ranked = [...quotes].sort((a, b) => b.pct - a.pct)
  const rows = [...ranked.slice(0, 3), ...ranked.slice(-3).filter((q) => !ranked.slice(0, 3).includes(q))]
  if (!rows.length) return null
  return (
    <div class="py-1">
      {rows.map((q) => (
        <a key={q.symbol} href={`#/research/${q.symbol.toLowerCase()}`}
          class="flex justify-between px-3 py-[2px] font-mono text-[11px] hover:bg-surface-2 hover:no-underline">
          <span class="text-ink font-bold">{q.symbol}</span>
          <span class={q.pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(q.pct)}</span>
        </a>
      ))}
    </div>
  )
}

function MiniChart({ symbol }) {
  const el = useRef(null)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (!el.current) return
    const chart = createChart(el.current, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: '#79828d', fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, visible: false },
      crosshair: { mode: 0 },
      handleScroll: false,
      handleScale: false,
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: '#f59e0b', lineWidth: 1,
      topColor: 'rgba(245,158,11,0.25)', bottomColor: 'rgba(245,158,11,0)',
      priceLineVisible: false,
    })
    let dead = false
    fetchHistory(symbol, '3M')
      .then(({ bars }) => {
        if (dead) return
        series.setData(bars.map((b) => ({ time: b.time, value: b.close })))
        chart.timeScale().fitContent()
      })
      .catch(() => !dead && setErr(true))
    return () => { dead = true; chart.remove() }
  }, [symbol])
  return err
    ? <div class="h-[110px] flex items-center justify-center font-mono text-[10px] text-muted">no chart</div>
    : <div ref={el} class="h-[110px]" />
}

function ChartWidget({ symbol }) {
  const quotes = useQuotes([symbol])
  const q = quotes[symbol]?.quote
  return (
    <div>
      <div class="flex items-baseline gap-2 px-3 pt-1.5 font-mono text-[11px]">
        <a href={`#/research/${symbol.toLowerCase()}`} class="text-ink font-bold hover:no-underline">{symbol}</a>
        {q && <span class="text-ink-2">{fmtPrice(q.price)}</span>}
        {q && <span class={q.pct >= 0 ? 'text-up' : 'text-down'}>{fmtPct(q.pct)}</span>}
        <span class="text-muted text-[9px] ml-auto">3M</span>
      </div>
      <MiniChart symbol={symbol} />
    </div>
  )
}

/** Hover chrome shared by every rail widget: ↑ ↓ ✕ in the top-right. */
function WidgetFrame({ id, children }) {
  return (
    <div class="relative group">
      <div class="absolute top-1 right-1.5 z-10 hidden group-hover:flex gap-0.5 bg-surface-2 rounded px-0.5">
        <button onClick={() => moveWidget(id, -1)} class="font-mono text-[10px] text-muted hover:text-ink px-0.5">↑</button>
        <button onClick={() => moveWidget(id, 1)} class="font-mono text-[10px] text-muted hover:text-ink px-0.5">↓</button>
        <button onClick={() => removeWidget(id)} class="font-mono text-[10px] text-muted hover:text-down px-0.5">✕</button>
      </div>
      {children}
    </div>
  )
}

function AddWidget() {
  const [open, setOpen] = useState(false)
  const [sym, setSym] = useState('')
  const pick = (type) => {
    if (type === 'chart') return // chart adds via the symbol form
    addWidget(type)
    setOpen(false)
  }
  const submitChart = (e) => {
    e.preventDefault()
    if (addWidget('chart', sym)) {
      setSym('')
      setOpen(false)
    }
  }
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        class="font-mono text-[10px] text-muted hover:text-accent border border-dashed border-line rounded-xl py-1.5 hover:border-accent/50"
      >
        + {tl('widget')}
      </button>
    )
  }
  return (
    <div class="bg-surface-1 border border-line rounded-xl p-2 flex flex-col gap-1.5">
      <div class="flex flex-wrap gap-1">
        {WIDGET_TYPES.filter((t) => t !== 'chart').map((t) => (
          <button key={t} onClick={() => pick(t)}
            class="font-mono text-[10px] px-2 py-0.5 rounded border border-line text-ink-2 hover:border-accent hover:text-accent">
            {tl(t)}
          </button>
        ))}
      </div>
      <form onSubmit={submitChart} class="flex gap-1">
        <input
          value={sym}
          onInput={(e) => setSym(e.currentTarget.value)}
          placeholder="chart: SYM"
          class="flex-1 min-w-0 bg-transparent border border-line rounded px-1.5 py-0.5 font-mono text-[10px] text-ink uppercase outline-none focus:border-accent placeholder:text-muted"
        />
        <button type="submit" class="font-mono text-[10px] px-2 rounded border border-line text-ink-2 hover:border-accent hover:text-accent">+</button>
      </form>
      <button onClick={() => setOpen(false)} class="font-mono text-[9px] text-muted hover:text-ink self-start">{tl('cancel')}</button>
    </div>
  )
}

/** Watchlist split into bucket groups (TUI's `── group ──` separators). */
function groupRows(watchlist) {
  const groups = []
  const seen = new Set()
  for (const b of BUCKETS) {
    const syms = b.symbols.filter((s) => watchlist.includes(s))
    if (!syms.length) continue
    groups.push({ name: b.name, symbols: syms })
    syms.forEach((s) => seen.add(s))
  }
  const rest = watchlist.filter((s) => !seen.has(s))
  if (rest.length) groups.push({ name: 'General', symbols: rest })
  return groups
}

function RailWidget({ w, all, watchlist, earnDays }) {
  if (w.type === 'pulse') return <PulsePanel quotes={all} />
  if (w.type === 'earnings') return <EarningsPanel symbols={watchlist} days={earnDays} />
  if (w.type === 'calendar') return <MacroCalPanel />
  const title = w.type === 'movers' ? tl('Movers') : null
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      {title && (
        <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
          <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
        </header>
      )}
      {w.type === 'movers' && <MoversPanel quotes={all} />}
      {w.type === 'chart' && <ChartWidget symbol={w.symbol} />}
    </section>
  )
}

export function Dashboard() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  const earnDays = useEarningsDays(watchlist)
  const [widgets, setWidgets] = useState(getWidgets)
  useEffect(() => onWidgetsChange((w) => setWidgets([...w])), [])

  // 10s tick keeps the "updated" line and stale banner honest between fetches.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])
  const good = lastGoodTs()
  const updated = good
    ? new Date(good).toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' })
    : null
  const staleMin = good ? Math.floor((Date.now() - good) / 60_000) : 0

  const all = watchlist.map((s) => quotes[s]?.quote).filter((q) => q?.pct != null)
  const bucketAvg = (symbols) => {
    const pcts = symbols.map((s) => quotes[s]?.quote?.pct).filter((p) => p != null)
    return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
  }

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      {/* Thesis strip: bucket averages at a glance */}
      <div class="flex items-baseline gap-x-4 gap-y-1 px-1 pb-2 font-mono text-[10px] flex-wrap">
        {BUCKETS.map((b) => {
          const inList = b.symbols.filter((s) => watchlist.includes(s))
          const avg = bucketAvg(inList)
          if (avg == null) return null
          return (
            <span key={b.name} class="whitespace-nowrap">
              <span class="text-muted uppercase tracking-wider">{tl(b.name)}</span>{' '}
              <span class={avg >= 0 ? 'text-up' : 'text-down'}>{fmtPct(avg)}</span>
            </span>
          )
        })}
      </div>

      <div class="flex items-baseline gap-3 px-1 pb-1 font-mono text-[10px]">
        <span class="text-muted italic">
          {updated ? `${tl('updated')} ${updated} ET` : '…'}
        </span>
        {staleMin >= 5 && (
          <span class="text-down font-bold">
            ⚠ {tl('STALE — last good fetch')} {staleMin < 60 ? `${staleMin}m` : `${Math.floor(staleMin / 60)}h`} {tl('ago')}
          </span>
        )}
      </div>

      <div class="grid gap-3 xl:grid-cols-[1fr_230px] min-w-0">
        <section class="bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
          {groupRows(watchlist).map((g) => (
            <div key={g.name}>
              <div class="px-3 pt-1.5 pb-0.5 font-mono text-[10px] text-muted tracking-wider border-b border-line">
                ── {tl(g.name)} ──
              </div>
              {g.symbols.map((s) => (
                <TuiRow key={s} symbol={s} data={quotes[s]} earnDays={earnDays[s]} />
              ))}
            </div>
          ))}
        </section>
        <div class="flex flex-col gap-3 min-w-0">
          {widgets.map((w) => (
            <WidgetFrame key={w.id} id={w.id}>
              <RailWidget w={w} all={all} watchlist={watchlist} earnDays={earnDays} />
            </WidgetFrame>
          ))}
          <AddWidget />
        </div>
      </div>
    </div>
  )
}
