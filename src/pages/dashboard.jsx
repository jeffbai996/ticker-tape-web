import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, AreaSeries } from 'lightweight-charts'
import { boundedTimeScale } from '../lib/chartview.js'
import { useNamedWatchlists, useQuotes, useWatchlist } from '../hooks.js'
import { BUCKETS } from '../lib/symbols.js'
import { pulseStats } from '../lib/pulse.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { ECON_EVENTS, upcomingEvents } from '../lib/markets.js'
import { loadCatalysts, onCatalystsChange, mergedEvents } from '../lib/catalysts.js'
import { fetchHistory } from '../lib/history.js'
import {
  getWidgets, addWidget, removeWidget, moveWidget, onWidgetsChange, WIDGET_TYPES,
} from '../lib/widgets.js'
import {
  getGroupPrefs, isCollapsed, moveGroup, onGroupsChange, orderGroups,
  toggleCollapsed,
} from '../lib/catgroups.js'
import { watch, unwatch } from '../lib/watchlist.js'
import { addWatchlistSymbol, removeWatchlistSymbol } from '../lib/watchlists.js'
import { loadUserGroups, onUserGroupsChange } from '../lib/usergroups.js'
import { groupDashboardRows, quoteSpread, selectFlatRows } from '../lib/dashboardRows.js'
import { fmtPrice, fmtPriceBare, fmtPct, fmtChange, fmtVol, rangePos } from '../lib/format.js'
import { Histo } from '../components/Histo.jsx'
import { Marquee } from '../components/Marquee.jsx'
import { FlashMetric, FlashPrice } from '../components/Fig.jsx'
import { tl } from '../lib/i18n.js'

const DAY = 86_400_000
const ETF_SKIP = new Set(['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'])
const fmtAbsChange = (v) => fmtChange(Math.abs(v)).replace('+', '')
const fmtSpread = (v) => v == null ? '—' : v < 0.1 ? v.toFixed(3) : v.toFixed(2)

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
    <div class="flex items-baseline gap-1.5 max-sm:gap-1 font-mono text-[11px] max-sm:text-[10px] whitespace-nowrap">
      <span class={`w-7 ${rsiCls}`}>{r != null ? `R${Math.round(r)}` : ''}</span>
      <span class="w-7 text-accent">{earnDays != null ? `${earnDays}d` : ''}</span>
      <span class="w-7">{smaBadge(tech.above50, 50)}</span>
      <span class="w-9">{smaBadge(tech.above200, 200)}</span>
      <span class={`w-10 ${tech.volRatio >= 1.5 ? 'text-accent' : 'text-muted'}`}>
        {tech.volRatio != null ? `${tech.volRatio.toFixed(1)}xv` : ''}
      </span>
      <span class={`w-11 text-right ${tech.offHigh <= -15 ? 'text-down' : 'text-ink-2'}`}>
        {tech.offHigh != null ? `${Math.round(tech.offHigh)}%H` : ''}
      </span>
      <span class={`w-11 text-right ${(tech.rs ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
        {tech.rs != null ? `${tech.rs >= 0 ? '+' : ''}${Math.round(tech.rs)}%R` : ''}
      </span>
    </div>
  )
}

// ── Range meter (fills the row's wide-screen dead zone): DAY 265.83 ──●── 272.40 ──

function RangeBar({ label, lo, hi, v, cls = '' }) {
  const pos = rangePos(lo, hi, v)
  if (pos == null) return null
  return (
    <span class={`hidden @min-[730px]:flex items-center gap-1 font-mono text-[11px] font-normal whitespace-nowrap ${cls}`}>
      <span class="text-accent/60 font-normal text-[9px] w-6">{label}</span>
      <span class="text-down/80 w-14 text-right">
        <FlashMetric value={lo} fmt={fmtPriceBare} kind="low" />
      </span>
      <span class="relative w-14 h-[3px] bg-line rounded-full shrink-0 mx-0.5">
        <span
          class="absolute top-1/2 -translate-y-1/2 w-[3px] h-[7px] bg-accent-2 rounded-sm"
          style={{ left: `calc(${(pos * 100).toFixed(1)}% - 1.5px)` }}
        />
      </span>
      <span class="text-up/80 w-14">
        <FlashMetric value={hi} fmt={fmtPriceBare} kind="high" />
      </span>
    </span>
  )
}

/** The compact breakpoint keeps the same low → position → high grammar as the
 *  full range instead of turning the chart into an unlabeled mystery noodle. */
function CompactDayRange({ lo, hi, v }) {
  const pos = rangePos(lo, hi, v)
  if (pos == null) return null
  return (
    <span
      class="hidden @min-[545px]:flex @min-[730px]:hidden items-center gap-1 whitespace-nowrap font-mono text-[9.5px]"
      title={`DAY ${fmtPriceBare(lo)} – ${fmtPriceBare(hi)}`}
    >
      <span class="text-accent/60 font-normal text-[9px]">DAY</span>
      <span class="text-down/80 w-11 text-right">
        <FlashMetric value={lo} fmt={fmtPriceBare} kind="low" />
      </span>
      <span class="relative w-12 h-[3px] bg-line rounded-full shrink-0">
        <span
          class="absolute top-1/2 -translate-y-1/2 w-[3px] h-[7px] bg-accent-2 rounded-sm"
          style={{ left: `calc(${(pos * 100).toFixed(1)}% - 1.5px)` }}
        />
      </span>
      <span class="text-up/80 w-11">
        <FlashMetric value={hi} fmt={fmtPriceBare} kind="high" />
      </span>
    </span>
  )
}

function TuiRow({ symbol, data, earnDays, onRemove }) {
  const q = data?.quote
  const up = (q?.pct ?? 0) >= 0
  const extUp = (q?.extPct ?? 0) >= 0
  const heavy = (data?.tech?.volRatio ?? 0) >= 1.5
  // the 20-day average the ratio was measured against — VOL alone says
  // nothing without it, and it costs no extra fetch
  const avgVol = q?.volume != null && data?.tech?.volRatio
    ? q.volume / data.tech.volRatio : null
  return (
    <a
      href={`#/research/${symbol.toLowerCase()}`}
      class="tui-row group/row relative block px-3 py-[3px] border-b border-line last:border-0 hover:bg-white/[0.035] hover:no-underline"
      title={q?.name ? `${symbol} — ${q.name}` : symbol}
    >
      {/* favorites are managed where they live: hover a row, tap the star
          (Jeff 2026-08-05). Filled = on the board; a tap lifts it off. */}
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(symbol) }}
        title={`remove ${symbol} from the board`}
        class="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 grid place-items-center rounded-md text-accent opacity-0 group-hover/row:opacity-100 hover:bg-surface-2 hover:text-down transition-opacity"
      >
        ★
      </button>
      <div class="flex gap-4 min-w-0">
        <div class="flex-1 min-w-0 overflow-hidden">
          <div class="flex items-baseline gap-2 max-sm:gap-1.5 font-mono text-[13px] max-sm:text-[12px] flex-nowrap max-sm:flex-wrap min-w-0">
            <span class="tui-company-identity relative flex-1 min-w-[92px] max-sm:min-w-[76px] @min-[820px]:flex-none @min-[820px]:w-14 text-ink font-[650] font-tick text-[12px]">
              <span class="tui-company-symbol">{symbol}</span>
              {/* Compact/high-zoom rows use one identity slot: hover swaps the
                  ticker out and the company name into its exact footprint.
                  The elastic slot consumes spare width up to the fixed quote
                  columns, letting long names breathe without moving them. */}
              {q?.name && (
                <span class="tui-company-name-swap @min-[820px]:hidden" aria-hidden="true">
                  {q.name}
                </span>
              )}
            </span>
            {/* CLI parity: `[bold]{sym}[/][dim]{name}[/]`. The name rides in a
                flexible gutter — it is the only thing on the row allowed to
                give up width, so the fixed price/change/AH columns stay aligned
                across rows AND never get pushed past the clip edge. Below
                820px the text hides but the gutter stays, collapsing to 0. */}
            <span class="tui-company-name-wide hidden @min-[820px]:block flex-1 min-w-0 max-w-[120px]">
              <Marquee text={q?.name || ''} title={q?.name ? `${symbol} — ${q.name}` : symbol}
                class="inline-block w-full text-[10.5px] text-muted font-normal font-anth" />
            </span>
            <span class="text-ink font-semibold w-[4.75rem] max-sm:w-[4.25rem] text-right shrink-0">
              {q ? <FlashPrice price={q.price} fmt={fmtPrice} /> : '—'}
            </span>
            {q && (
              <span class={`${up ? 'text-up' : 'text-down'} whitespace-nowrap w-[8rem] @max-[800px]:w-auto max-sm:w-auto shrink-0`}>
                {up ? '▲' : '▼'} <FlashMetric value={q.change} fmt={fmtAbsChange} kind="change" />{' '}
                <span class="font-normal text-[11px] max-sm:text-[10px]">
                  (<FlashMetric value={q.pct} fmt={fmtPct} kind="change" />)
                </span>
              </span>
            )}
            {/* extended hours reads a tier below the regular quote — on a
                phone it was the same size as the print and clipped off the
                right edge (Jeff 2026-08-04) */}
            {/* w-auto, not a fixed w-28: the change column before it is fixed
                so AH starts aligned anyway, and a fixed width clipped the pct
                mid-glyph at in-between widths (Jeff 2026-08-04, screenshot) */}
            {q?.extLabel && q.extPrice != null && (
              <span class="whitespace-nowrap text-[12px] max-sm:text-[10px] w-auto shrink-0 max-sm:ml-auto">
                <span class="text-[#c084fc]">{q.extLabel}</span>{' '}
                <span class="text-ink-2"><FlashPrice price={q.extPrice} fmt={fmtPriceBare} /></span>{' '}
                <span class={extUp ? 'text-up' : 'text-down'}>
                  {extUp ? '▲' : '▼'}{Math.abs(q.extPct ?? 0).toFixed(1)}%
                </span>
              </span>
            )}
          </div>
          {/* Phone width: badges scroll sideways instead of clipping mid-badge. */}
          <div class="flex items-center gap-2.5 pt-[2px] pl-0 min-w-0 @min-[430px]:overflow-hidden max-sm:overflow-x-auto no-scrollbar">
            {/* Container-relative width changes continuously with zoom. A
                breakpoint used to turn this from postage stamp to runway. */}
            <Histo bars={data?.histo} width={150} height={24}
              class="w-[clamp(76px,18cqw,168px)] h-6" />
            <Badges tech={data?.tech} earnDays={earnDays} />
          </div>
        </div>
        {/* Meters live in their own fixed column so DAY and 52W align by
            construction — sharing the text rows made them wrap and overflow
            once the row ran out of width (Jeff 2026-08-03). */}
        <div class="hidden @min-[545px]:flex shrink-0 flex-col justify-center gap-1 font-mono text-[11px]">
          <span class="flex items-baseline gap-1.5">
            {!q?.extLabel && (
              <CompactDayRange lo={q?.dayLow} hi={q?.dayHigh} v={q?.price} />
            )}
            <RangeBar label="DAY" lo={q?.dayLow} hi={q?.dayHigh} v={q?.price} />
            <span class="w-[4.5rem] @min-[820px]:w-[9.5rem] text-right whitespace-nowrap">
              {q && quoteSpread(q) != null && (
                <span class="hidden @min-[820px]:inline mr-2">
                  <span class="text-accent/60 text-[9px]">SPR</span>{' '}
                  <span class="text-ink-2 font-normal">{fmtSpread(quoteSpread(q))}</span>
                </span>
              )}
              {q?.volume != null && (
                <>
                  <span class="text-accent/70">VOL</span>{' '}
                  <span class={heavy ? 'text-accent' : 'text-ink'}>{fmtVol(q.volume)}</span>
                </>
              )}
            </span>
          </span>
          <span class="flex items-baseline gap-1.5">
            {data?.tech && (
              <RangeBar label="52W" lo={data.tech.low52} hi={data.tech.high52} v={q?.price} />
            )}
            <span class="w-[4.5rem] @min-[820px]:w-[9.5rem] text-right">
              {avgVol != null && (
                <>
                  <span class="text-accent/60 text-[9px]">AVG</span>{' '}
                  <span class="text-ink-2 font-normal">{fmtVol(avgVol)}</span>
                </>
              )}
            </span>
          </span>
        </div>
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
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden flex flex-col max-h-[42vh]">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Pulse')}</h2>
      </header>
      <div class="overflow-y-auto min-h-0">
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
    </div>
    </section>
  )
}

const ECON_COLORS = {
  FOMC: 'text-down', CPI: 'text-accent', NFP: 'text-accent',
  GDP: 'text-[#00c8ff]', PCE: 'text-[#c084fc]',
}

function MacroCalPanel() {
  const [cats, setCats] = useState(loadCatalysts)
  useEffect(() => onCatalystsChange(setCats), [])
  const events = mergedEvents(ECON_EVENTS, cats, new Date().toISOString().slice(0, 10), 60).slice(0, 8)
  if (!events.length) return null
  const dayCls = (d) =>
    d <= 0 ? 'text-imminent font-bold'
      : d <= 3 ? 'text-down font-bold' : d <= 7 ? 'text-down'
      : d <= 30 ? 'text-accent' : 'text-muted'
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden flex flex-col max-h-[42vh]">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <a href="#/markets/calendar" class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase hover:no-underline">
          {tl('Calendar')}
        </a>
      </header>
      <div class="overflow-y-auto min-h-0">
      <div class="py-1">
        {events.map((e) => (
          <div key={`${e.date}-${e.type}-${e.id ?? ''}`} class="flex items-baseline gap-2 px-3 py-[2px] font-mono text-[11px]">
            <span class={`w-10 font-bold shrink-0 truncate ${e.user ? 'text-[#00c8ff]' : ECON_COLORS[e.type] || 'text-ink-2'}`}>
              {e.user ? (e.symbol === 'MACRO' ? e.type : e.symbol) : e.type}
            </span>
            <span class="text-muted flex-1 truncate">{e.user ? e.rawLabel : tl(e.label)}</span>
            <span class={dayCls(e.days)}>{e.days === 0 ? tl('today') : `${e.days}d`}</span>
          </div>
        ))}
      </div>
    </div>
    </section>
  )
}

function EarningsPanel({ symbols, days, quotes = {} }) {
  const upcoming = symbols
    .filter((s) => days[s] != null)
    .map((s) => ({ symbol: s, d: days[s] }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 9)
  if (!upcoming.length) return null
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden flex flex-col max-h-[42vh]">
      <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Earnings')}</h2>
      </header>
      <div class="overflow-y-auto min-h-0">
      <div class="py-1">
        {upcoming.map(({ symbol, d }) => {
          // the quote feed already carries shortName — no extra fetch
          const name = quotes[symbol]?.quote?.name || ''
          return (
            <a key={symbol} href={`#/research/${symbol.toLowerCase()}/earnings`}
              class="grid grid-cols-[2.55rem_minmax(0,1fr)_2rem] items-baseline gap-1.5 px-3 py-[2px] font-mono text-[11px] hover:bg-surface-3 hover:no-underline"
              title={name || symbol}>
              <span class="text-ink font-[650] font-anth truncate">{symbol}</span>
              {/* company name, quiet — the CLI's `[dim]{name}[/]`, sliding into
                  view on hover when the rail is too narrow to hold it */}
              <Marquee text={name} class="min-w-0 text-left text-[9px] text-muted font-anth font-light" />
              <span class={`text-right ${d <= 0 ? 'text-imminent font-bold'
                : d <= 7 ? 'text-down' : d <= 21 ? 'text-accent' : 'text-ink-2'}`}>{d}d</span>
            </a>
          )
        })}
      </div>
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
          class="flex justify-between px-3 py-[2px] font-mono text-[11px] hover:bg-surface-3 hover:no-underline">
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
      timeScale: { ...boundedTimeScale(false), borderVisible: false, visible: false },
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
    ? <div class="h-[110px] flex items-center justify-center font-mono text-[10px] text-muted">{tl('no chart')}</div>
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

/** Add-to-watchlist control, pinned as the last row of the watchlist card.
 *  The only affordances used to be the sidebar's 56px "+ SYM" input and the
 *  command bar's `w SYM` — neither reads as a control, and the sidebar is
 *  hidden entirely below 768px (Jeff 2026-08-04: "not very obvious where to
 *  add tickers"). Mirrors AddWidget's dashed-button → inline-form idiom. */
function AddSymbolRow({ onAdd, isPresent }) {
  const [open, setOpen] = useState(false)
  const [sym, setSym] = useState('')
  const [err, setErr] = useState('')
  const input = useRef(null)
  useEffect(() => { if (open) input.current?.focus() }, [open])
  const close = () => { setOpen(false); setSym(''); setErr('') }
  const submit = (e) => {
    e.preventDefault()
    const v = sym.trim().toUpperCase()
    if (!v) return close()
    if (onAdd(v)) return close()
    // The mutator returns null for invalid / duplicate / list-full — say which.
    setErr(isPresent(v) ? `${v} ${tl('already on the list')}` : `${tl('not a symbol')}: ${v}`)
  }
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        class="w-full border-t border-line px-3 py-2 text-left font-mono text-[11px] tracking-wider text-muted hover:text-accent hover:bg-white/[0.035]"
      >
        + {tl('add symbol')}
      </button>
    )
  }
  return (
    <form onSubmit={submit} class="flex items-center gap-2 border-t border-line px-3 py-1.5">
      <input
        ref={input}
        value={sym}
        onInput={(e) => { setSym(e.currentTarget.value); setErr('') }}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        placeholder="SYM"
        class="w-24 bg-transparent border border-line rounded px-1.5 py-0.5 font-mono text-[11px] text-ink uppercase outline-none focus:border-accent placeholder:text-muted"
      />
      <button type="submit" class="font-mono text-[11px] px-2 py-0.5 rounded border border-line text-ink-2 hover:border-accent hover:text-accent">
        {tl('add')}
      </button>
      <button type="button" onClick={close} class="font-mono text-[10px] text-muted hover:text-ink">
        {tl('cancel')}
      </button>
      {err && <span class="font-mono text-[10px] text-down">{err}</span>}
    </form>
  )
}

/** Watchlist split into bucket groups (TUI's `── group ──` separators).
 *  User groups (`group semis NVDA …` in the command bar) come first and claim
 *  their symbols away from the built-in buckets. */
function RailWidget({ w, all, watchlist, earnDays, quotes }) {
  if (w.type === 'pulse') return <PulsePanel quotes={all} />
  if (w.type === 'earnings') return <EarningsPanel symbols={watchlist} days={earnDays} quotes={quotes} />
  if (w.type === 'calendar') return <MacroCalPanel />
  const title = w.type === 'movers' ? tl('Movers') : null
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      {title && (
        <header class="px-3 py-1.5 border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
        </header>
      )}
      {w.type === 'movers' && <MoversPanel quotes={all} />}
      {w.type === 'chart' && <ChartWidget symbol={w.symbol} />}
    </section>
  )
}

/** "+ add" that blooms into an input in place — one control, no chrome.
 *  Enter adds (uppercased) and keeps focus for the next one; Esc folds it. */
function QuickAdd({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (onAdd(v)) setV('')
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        class="whitespace-nowrap font-mono text-[10px] text-muted border border-dashed border-line-2 rounded-full px-2 py-px hover:text-accent hover:border-accent/60 transition-colors">
        + {tl('add')}
      </button>
    )
  }
  return (
    <form onSubmit={submit} class="inline-flex">
      <input
        autoFocus
        value={v}
        onInput={(e) => setV(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { setOpen(false); setV('') } }}
        onBlur={() => { if (!v.trim()) setOpen(false) }}
        placeholder="SYM"
        class="w-16 bg-surface-2 border border-accent/60 rounded-full px-2 py-px font-mono text-[10px] text-ink uppercase outline-none placeholder:text-muted placeholder:normal-case"
      />
    </form>
  )
}

export function Dashboard({ listId = null }) {
  const mainWatchlist = useWatchlist()
  const namedWatchlists = useNamedWatchlists()
  const activeList = listId ? namedWatchlists.find((item) => item.id === listId) : null
  const watchlist = activeList?.symbols || mainWatchlist
  const quotes = useQuotes(watchlist)
  const earnDays = useEarningsDays(watchlist)
  const [widgets, setWidgets] = useState(getWidgets)
  const [groupPrefs, setGroupPrefs] = useState(getGroupPrefs)
  const [viewMode, setViewModeState] = useState(() => localStorage.getItem('dashboard_view_mode_v1') || 'grouped')
  const [sort, setSortState] = useState(() => localStorage.getItem('dashboard_sort_v1') || 'manual')
  const [filter, setFilter] = useState('')
  const setViewMode = (mode) => {
    setViewModeState(mode)
    localStorage.setItem('dashboard_view_mode_v1', mode)
  }
  const setSort = (value) => {
    setSortState(value)
    localStorage.setItem('dashboard_sort_v1', value)
  }
  useEffect(() => onGroupsChange(setGroupPrefs), [])
  const [, bumpGroups] = useState(0)
  useEffect(() => onUserGroupsChange(() => bumpGroups((n) => n + 1)), [])
  const userGroups = loadUserGroups()
  const visibleManual = selectFlatRows(watchlist, quotes, { filter }).map((row) => row.symbol)
  const ordered = orderGroups(
    groupDashboardRows(visibleManual, userGroups),
    groupPrefs.order,
  )
  const flatRows = selectFlatRows(watchlist, quotes, { filter, sort })
  const names = ordered.map((g) => g.name)
  useEffect(() => onWidgetsChange((w) => setWidgets([...w])), [])
  const addSymbol = activeList
    ? (symbol) => addWatchlistSymbol(activeList.id, symbol)
    : watch
  const removeSymbol = activeList
    ? (symbol) => removeWatchlistSymbol(activeList.id, symbol)
    : unwatch
  const isPresent = (symbol) => watchlist.includes(String(symbol || '').trim().toUpperCase())

  // 10s tick keeps the "updated" line and stale banner honest between fetches.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])
  const all = watchlist.map((s) => quotes[s]?.quote).filter((q) => q?.pct != null)
  const bucketAvg = (symbols) => {
    const pcts = symbols.map((s) => quotes[s]?.quote?.pct).filter((p) => p != null)
    return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
  }

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <div class="dashboard-toolbar md:flex md:items-center md:gap-4 md:px-1 md:pb-2 min-w-0">
        <div class="dashboard-controls flex items-center gap-2 px-1 pb-2 md:px-0 md:pb-0 min-w-0 shrink-0">
          {activeList && (
            <div class="min-w-0 mr-1">
              <div class="font-mono text-[8px] uppercase tracking-wider text-muted">{tl('Watchlist')}</div>
              <div class="font-anth font-bold text-[13px] text-ink truncate">{activeList.name}</div>
            </div>
          )}
          <div class={`${activeList ? 'ml-auto' : ''} inline-flex rounded-lg border border-line bg-surface-1 p-0.5 shrink-0`}>
            <button onClick={() => setViewMode('grouped')}
              class={`px-2 py-1 rounded-md font-anth text-[10px] transition-colors ${viewMode === 'grouped' ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'}`}>
              {tl('Sectors')}
            </button>
            <button onClick={() => setViewMode('flat')}
              class={`px-2 py-1 rounded-md font-anth text-[10px] transition-colors ${viewMode === 'flat' ? 'bg-accent-soft text-accent' : 'text-muted hover:text-ink'}`}>
              {tl('All')}
            </button>
          </div>
          <input value={filter} onInput={(e) => setFilter(e.currentTarget.value)}
            placeholder={`${tl('Search')}…`}
            class="min-w-0 w-32 sm:w-40 bg-surface-1 border border-line rounded-lg px-2 py-1 font-anth text-[10px] text-ink outline-none focus:border-accent placeholder:text-muted" />
          {viewMode === 'flat' && (
            <select value={sort} onChange={(e) => setSort(e.currentTarget.value)}
              class="bg-surface-1 border border-line rounded-lg px-2 py-1 font-anth text-[10px] text-ink-2 outline-none focus:border-accent">
              <option value="manual">{tl('Sort')}</option>
              <option value="symbol">{tl('Ticker')}</option>
              <option value="change">% {tl('Reaction')}</option>
              <option value="price">{tl('Price')}</option>
              <option value="spread">{tl('Spread')}</option>
            </select>
          )}
        </div>

        {/* Thesis strip: bucket averages at a glance. One swipeable line at
            every width — it wrapped to four lines of prime real estate
            (Jeff 2026-08-04: "keep it all on one line somehow"). */}
        <div class="dashboard-sectors flex items-baseline gap-x-4 px-1 pb-2 md:px-0 md:pb-0 md:ml-auto md:flex-1 min-w-0 font-mono text-[10px] flex-nowrap overflow-x-auto no-scrollbar">
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
          <QuickAdd onAdd={addSymbol} />
        </div>
      </div>

      {/* lg (1024px) not xl: the rail used to vanish one browser-zoom notch in.
          1024 keeps it alive through two more notches (115%, 125%) on a 1376px
          CSS viewport before genuinely running out of room. */}
      <div class="grid gap-2 lg:grid-cols-[1fr_230px] min-w-0">
        <section class="@container bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
          {viewMode === 'grouped' ? ordered.map((g, gi) => {
            const folded = isCollapsed(g.name, groupPrefs)
            return (
              <div key={g.name}>
                <div class={`group flex items-center gap-2 px-3 py-1.5 font-mono text-[11px] text-muted tracking-wider border-b border-line select-none ${gi ? 'border-t' : ''}`}>
                  <button onClick={() => toggleCollapsed(g.name)}
                          class="flex-1 flex items-center gap-2 hover:text-ink uppercase text-left"
                          title={folded ? 'expand' : 'collapse'}>
                    {tl(g.name)}
                    {folded && (
                      <span class="text-[9px] text-ink-2 border border-line rounded-full px-1.5 py-px leading-none tracking-normal normal-case">
                        {g.symbols.length}
                      </span>
                    )}
                  </button>
                  <span class="hidden group-hover:flex gap-0.5">
                    <button onClick={(e) => { e.stopPropagation(); moveGroup(g.name, -1, names) }}
                            class="text-[10px] text-muted hover:text-ink px-1" title="move up">↑</button>
                    <button onClick={(e) => { e.stopPropagation(); moveGroup(g.name, 1, names) }}
                            class="text-[10px] text-muted hover:text-ink px-1" title="move down">↓</button>
                  </span>
                </div>
                {!folded && g.symbols.map((s) => (
                  <TuiRow key={s} symbol={s} data={quotes[s]} earnDays={earnDays[s]}
                    onRemove={removeSymbol} />
                ))}
              </div>
            )
          }) : flatRows.map(({ symbol }) => (
            <TuiRow key={symbol} symbol={symbol} data={quotes[symbol]} earnDays={earnDays[symbol]}
              onRemove={removeSymbol} />
          ))}
          {!watchlist.length && (
            <div class="px-3 py-8 text-center font-anth text-[11px] text-muted">{tl('empty watchlist — add the first ticker below')}</div>
          )}
          <AddSymbolRow onAdd={addSymbol} isPresent={isPresent} />
        </section>
        <div class="flex flex-col gap-3 min-w-0">
          {widgets.map((w) => (
            <WidgetFrame key={w.id} id={w.id}>
              <RailWidget w={w} all={all} watchlist={watchlist} earnDays={earnDays} quotes={quotes} />
            </WidgetFrame>
          ))}
          <AddWidget />
        </div>
      </div>
    </div>
  )
}
