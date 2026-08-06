import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, AreaSeries } from 'lightweight-charts'
import { boundedTimeScale } from '../lib/chartview.js'
import { useNamedWatchlists, useQuotes, useWatchlist } from '../hooks.js'
import { BUCKETS } from '../lib/symbols.js'
import { pulseStats } from '../lib/pulse.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { ECON_EVENTS, MARKET_DECK, upcomingEvents } from '../lib/markets.js'
import { loadCatalysts, onCatalystsChange, mergedEvents } from '../lib/catalysts.js'
import { fetchHistory } from '../lib/history.js'
import {
  getWidgets, addWidget, removeWidget, moveWidget, onWidgetsChange, WIDGET_TYPES,
} from '../lib/widgets.js'
import {
  getGroupPrefs, isCollapsed, moveGroup, onGroupsChange, orderGroups,
  toggleCollapsed,
} from '../lib/catgroups.js'
import { isWatched, moveSymbol, placeSymbol, unwatch, watch } from '../lib/watchlist.js'
import { addWatchlistSymbol, moveWatchlistSymbol, removeWatchlistSymbol } from '../lib/watchlists.js'
import { loadUserGroups, onUserGroupsChange } from '../lib/usergroups.js'
import { groupDashboardRows, quoteSpread, selectFlatRows } from '../lib/dashboardRows.js'
import { searchSymbols } from '../lib/symbolSearch.js'
import { fmtPrice, fmtPriceBare, fmtPct, fmtChange, fmtVol, rangePos } from '../lib/format.js'
import { Histo } from '../components/Histo.jsx'
import { Marquee } from '../components/Marquee.jsx'
import { FlashMetric, FlashPrice } from '../components/Fig.jsx'
import { tl } from '../lib/i18n.js'
import { extendedLabelClass } from '../lib/extendedHours.js'

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
    <span class={`hidden @min-[730px]:flex items-center gap-[3px] font-mono text-[11px] font-normal whitespace-nowrap ${cls}`}>
      <span class="text-accent/60 font-normal text-[9px] w-6">{label}</span>
      <span class="text-down/80 w-[3.15rem] text-right">
        <FlashMetric value={lo} fmt={fmtPriceBare} kind="low" />
      </span>
      <span class="relative w-14 h-[3px] bg-line rounded-full shrink-0 mx-1">
        <span
          class="absolute top-1/2 -translate-y-1/2 w-[3px] h-[7px] bg-accent-2 rounded-sm"
          style={{ left: `calc(${(pos * 100).toFixed(1)}% - 1.5px)` }}
        />
      </span>
      <span class="text-up/80 w-[3.15rem]">
        <FlashMetric value={hi} fmt={fmtPriceBare} kind="high" />
      </span>
    </span>
  )
}

/** The compact breakpoint keeps the same low → position → high grammar as the
 *  full range instead of turning the chart into an unlabeled mystery noodle. */
function CompactDayRange({ lo, hi, v, cls = '' }) {
  const pos = rangePos(lo, hi, v)
  if (pos == null) return null
  return (
    <span
      class={`hidden @min-[545px]:flex @min-[730px]:hidden items-center gap-1 whitespace-nowrap font-mono text-[9.5px] ${cls}`}
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

function TuiRow({ symbol, data, earnDays, onRemove, selecting, selected, onToggleSelect }) {
  const q = data?.quote
  // Touch has no hover, so a tap on the ticker used to jump straight to the
  // symbol page and the name was unreachable (Jeff 2026-08-05). First tap
  // reveals it, second follows the link — and only where the name isn't
  // already sitting inline.
  const [revealed, setRevealed] = useState(false)
  const identityRef = useRef(null)
  const onIdentityTap = (e) => {
    if (revealed || !matchMedia('(hover: none)').matches) return
    const inline = identityRef.current?.querySelector('[data-inline-name]')
    if (inline && inline.offsetParent !== null) return
    e.preventDefault()
    e.stopPropagation()
    setRevealed(true)
  }
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
      onClick={(e) => { if (selecting) { e.preventDefault(); e.stopPropagation(); onToggleSelect(symbol) } }}
      class={`tui-row group/row relative block px-3 py-[3px] border-b border-line last:border-0 hover:no-underline${
        selecting ? ' pl-9 cursor-pointer' : ''}${selected ? ' bg-accent-soft' : ' hover:bg-white/[0.035]'}${revealed ? ' is-revealed' : ''}`}
      title={q?.name ? `${symbol} — ${q.name}` : symbol}
    >
      {/* select mode: rows become toggles — the box replaces navigation, so
          a misclick can't yank you off the board mid-batch */}
      {selecting && (
        <span class={`absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 grid place-items-center rounded border text-[10px] leading-none ${
          selected ? 'border-accent bg-accent text-black' : 'border-line-2 text-transparent'}`}>
          ✓
        </span>
      )}
      {/* favorites are managed where they live: hover a row, tap the star
          (Jeff 2026-08-05). Filled = on the board; a tap lifts it off. */}
      {!selecting && <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(symbol) }}
        title={`remove ${symbol} from the board`}
        class="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 w-6 h-6 grid place-items-center rounded-md text-accent opacity-0 group-hover/row:opacity-100 hover:bg-surface-2 hover:text-down transition-opacity"
      >
        ★
      </button>}
      {/* the meters column needs air off the quote cluster — at mid widths
          VOL was landing flush against the extended-hours percentage */}
      <div class="flex gap-6 max-sm:gap-2 min-w-0">
        <div class="flex-1 min-w-0 overflow-hidden">
          <div class="flex items-baseline gap-1.5 max-sm:gap-1 font-mono text-[13px] max-sm:text-[12px] flex-nowrap max-sm:flex-wrap min-w-0">
            <span ref={identityRef} onClick={onIdentityTap}
              class="tui-company-identity relative flex items-baseline gap-1.5 flex-1 min-w-0 @min-[820px]:flex-none @min-[820px]:w-14 text-ink font-[650] font-tick text-[12px]">
              <span class="tui-company-symbol shrink-0">{symbol}</span>
              {/* The elastic slot used to sit empty next to a short ticker and
                  only show the name on hover (Jeff 2026-08-05: "don't let it
                  go to waste"). Now the name rides inline wherever the slot
                  has room, truncating into whatever is left. */}
              {q?.name && (
                <span data-inline-name class="hidden @min-[545px]:block @min-[820px]:hidden min-w-0 truncate text-[10.5px] text-muted font-normal font-anth">
                  {q.name}
                </span>
              )}
              {/* Below that the slot is too narrow for two strings, so the
                  hover swap still trades the ticker for the name in place. */}
              {q?.name && (
                <span class="tui-company-name-swap @min-[545px]:hidden" aria-hidden="true">
                  {q.name}
                </span>
              )}
            </span>
            {/* CLI parity: `[bold]{sym}[/][dim]{name}[/]`. The name rides in a
                flexible gutter — it is the only thing on the row allowed to
                give up width, so the fixed price/change/AH columns stay aligned
                across rows AND never get pushed past the clip edge. Below
                820px the text hides but the gutter stays, collapsing to 0. */}
            <span class="tui-company-name-wide hidden @min-[820px]:block flex-1 min-w-0 max-w-[120px] @min-[1080px]:max-w-[240px]">
              <Marquee text={q?.name || ''} title={q?.name ? `${symbol} — ${q.name}` : symbol}
                class="inline-block w-full text-[10.5px] text-muted font-normal font-anth" />
            </span>
            {/* The quote cluster is indivisible. The identity slot gets the
                row's spare width, but must yield before PRE/AH is clipped. */}
            <span class="tui-quote-cluster flex items-baseline gap-1.5 max-sm:gap-1 shrink-0">
              <span class="text-ink font-semibold w-[4.4rem] max-sm:w-[4.1rem] text-right shrink-0">
                {q ? <FlashPrice price={q.price} fmt={fmtPrice} /> : '—'}
              </span>
              {/* min-width, not width: a wide print (▼ 15.22 (-4.05%)) used to
                  overflow the fixed box and land flush against the ON label,
                  while narrower ones still line up */}
              {q && (
                <span class={`${up ? 'text-up' : 'text-down'} whitespace-nowrap min-w-[7.7rem] max-sm:min-w-0 shrink-0`}>
                  {up ? '▲' : '▼'} <FlashMetric value={q.change} fmt={fmtAbsChange} kind="change" />{' '}
                  <span class="font-normal text-[11px] max-sm:text-[10px]">
                    (<FlashMetric value={q.pct} fmt={fmtPct} kind="change" />)
                  </span>
                </span>
              )}
              {/* extended hours reads a tier below the regular quote — on a
                  phone it was the same size as the print and clipped off the
                  right edge (Jeff 2026-08-04) */}
              {q?.extLabel && q.extPrice != null && (
                <span class="whitespace-nowrap text-[11px] max-sm:text-[10px] w-auto shrink-0 max-sm:ml-auto">
                  <span class={`font-semibold ${extendedLabelClass(q.extLabel)}`}>{q.extLabel}</span>{' '}
                  <span class="text-ink-2 font-semibold"><FlashPrice price={q.extPrice} fmt={fmtPriceBare} /></span>{' '}
                  <span class={`font-normal ${extUp ? 'text-up' : 'text-down'}`}>
                    {extUp ? '▲' : '▼'}{Math.abs(q.extPct ?? 0).toFixed(1)}%
                  </span>
                </span>
              )}
            </span>
          </div>
          {/* Phone width: badges scroll sideways instead of clipping mid-badge. */}
          <div class="flex items-center gap-2.5 pt-[2px] pl-0 min-w-0 @min-[430px]:overflow-hidden max-sm:overflow-x-auto no-scrollbar">
            {/* Container-relative width changes continuously with zoom. A
                breakpoint used to turn this from postage stamp to runway. */}
            <Histo bars={data?.histo} width={150} height={24}
              class="w-[clamp(76px,18cqw,168px)] h-6 shrink-0" />
            {/* badges yield first: they are chips you glance at, while a range
                clipped mid-number (Jeff 2026-08-05: "RHS occluded") is worse
                than a badge that isn't drawn */}
            <div class="min-w-0 overflow-hidden max-sm:overflow-visible @min-[730px]:ml-auto">
              <Badges tech={data?.tech} earnDays={earnDays} />
            </div>
            {/* An extended-hours print evicts the day range from the meters
                column at this width, which used to mean no intraday range at
                all overnight. The badge line has the room, so it takes it. */}
            {q?.extLabel && (
              <CompactDayRange lo={q?.dayLow} hi={q?.dayHigh} v={q?.price}
                cls="ml-auto shrink-0 pr-1" />
            )}
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
            <span class="w-[4.6rem] @min-[820px]:w-[9.2rem] text-right whitespace-nowrap">
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
            <span class="w-[4.6rem] @min-[820px]:w-[9.2rem] text-right whitespace-nowrap">
              {q?.dayHigh != null && q?.dayLow != null && q?.price > 0 && (
                <span class="hidden @min-[820px]:inline mr-2">
                  <span class="text-accent/60 text-[9px]">RNG</span>{' '}
                  <span class="text-ink-2 font-normal">
                    {(((q.dayHigh - q.dayLow) / q.price) * 100).toFixed(1)}%
                  </span>
                </span>
              )}
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

function MarketDeckPanel() {
  const quotes = useQuotes(MARKET_DECK.map((item) => item.symbol))
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden flex flex-col">
      <header class="flex items-center px-3 py-1.5 border-b border-line-2 bg-surface-2">
        <a href="#/markets" class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase hover:no-underline">
          {tl('Global markets')}
        </a>
        <a href="#/markets" aria-label={tl('Open markets')} class="ml-auto text-muted hover:text-accent hover:no-underline">→</a>
      </header>
      <div class="grid grid-cols-2 py-1">
        {MARKET_DECK.map((item) => {
          const q = quotes[item.symbol]?.quote
          return (
            <a key={item.symbol} href={`#/research/${item.symbol.toLowerCase()}`}
              class="min-w-0 flex items-baseline gap-1.5 px-2.5 py-[2px] font-mono text-[10.5px] hover:bg-surface-3 hover:no-underline odd:border-r odd:border-line">
              <span class="font-anth text-muted truncate">{tl(item.label)}</span>
              <span class={`ml-auto shrink-0 font-semibold ${!q ? 'text-muted' : q.pct >= 0 ? 'text-up' : 'text-down'}`}>
                {q ? fmtPct(q.pct) : '—'}
              </span>
            </a>
          )
        })}
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
          placeholder={tl('chart: SYM')}
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
/** Reorder mode: the flat list with grips — drag a row onto another, or
 *  nudge with the arrows. Exits back to the normal board via done. */
function ReorderList({ watchlist, quotes, onMove, onPlace, onDone }) {
  const [dragSym, setDragSym] = useState(null)
  return (
    <div>
      <div class="flex items-center px-3 py-1.5 border-b border-line font-mono text-[10px] tracking-wider text-muted uppercase">
        {tl('drag rows or use the arrows')}
        <button onClick={onDone}
          class="ml-auto px-2 py-0.5 rounded border border-accent text-accent hover:bg-accent hover:text-black font-semibold normal-case">
          {tl('done')}
        </button>
      </div>
      {watchlist.map((s) => {
        const q = quotes[s]?.quote
        const up = (q?.pct ?? 0) >= 0
        return (
          <div
            key={s}
            draggable
            onDragStart={(e) => { setDragSym(s); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); if (dragSym && dragSym !== s) onPlace(dragSym, s) }}
            onDragEnd={() => setDragSym(null)}
            class={`flex items-center gap-2.5 px-3 py-1 border-b border-line/60 font-mono text-[12px] cursor-grab active:cursor-grabbing select-none ${
              dragSym === s ? 'opacity-40' : 'hover:bg-white/[0.035]'
            }`}
          >
            <span class="text-muted text-[13px] leading-none">≡</span>
            <span class="text-ink font-[650] font-tick w-14">{s}</span>
            <span class="text-ink-2">{q ? fmtPrice(q.price) : '—'}</span>
            {q && <span class={`text-[10px] ${up ? 'text-up' : 'text-down'}`}>{fmtPct(q.pct)}</span>}
            <span class="ml-auto flex gap-0.5">
              <button onClick={() => onMove(s, -1)} title={tl('move up')}
                class="w-6 h-6 grid place-items-center rounded text-muted hover:text-ink hover:bg-surface-2">↑</button>
              <button onClick={() => onMove(s, 1)} title={tl('move down')}
                class="w-6 h-6 grid place-items-center rounded text-muted hover:text-ink hover:bg-surface-2">↓</button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function AddSymbolRow({ onAdd, isPresent, onReorder }) {
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
      <div class="flex items-center border-t border-line">
        <button
          onClick={() => setOpen(true)}
          class="flex-1 px-3 py-2 text-left font-mono text-[11px] tracking-wider text-muted hover:text-accent hover:bg-white/[0.035]"
        >
          + {tl('add symbol')}
        </button>
        <button
          onClick={onReorder}
          title={tl('reorder the list')}
          class="px-3 py-2 font-mono text-[11px] tracking-wider text-muted hover:text-accent hover:bg-white/[0.035]"
        >
          ⇅ {tl('reorder')}
        </button>
      </div>
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
  if (w.type === 'markets') return <MarketDeckPanel />
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

function SectorScroller({ watchlist, quotes, onAdd }) {
  const scroller = useRef(null)
  const [canRight, setCanRight] = useState(false)
  const [canLeft, setCanLeft] = useState(false)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const measure = () => {
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
      setCanLeft(el.scrollLeft > 2)
    }
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // the sector cells only MOUNT once quotes land — at mount the strip holds
    // just the add-pill, so observing the then-current children saw nothing.
    // Watch the child list itself and re-measure as cells appear.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const mo = new MutationObserver(() => {
      measure()
      for (const child of el.children) ro.observe(child)
    })
    mo.observe(el, { childList: true })
    for (const child of el.children) ro.observe(child)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
      mo.disconnect()
    }
  }, [watchlist.join(',')])
  const bucketAvg = (symbols) => {
    const pcts = symbols.map((s) => quotes[s]?.quote?.pct).filter((p) => p != null)
    return pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
  }
  return (
    <div class="relative md:ml-auto md:flex-1 min-w-0">
      <div ref={scroller}
        class={`dashboard-sectors flex items-baseline gap-x-4 px-1 pb-2 md:px-0 md:pb-0 min-w-0 font-mono text-[10px] flex-nowrap overflow-x-auto no-scrollbar ${canRight ? 'pr-9' : ''}`}>
        {BUCKETS.map((b) => {
          const inList = b.symbols.filter((s) => watchlist.includes(s))
          const avg = bucketAvg(inList)
          if (avg == null) return null
          return (
            <a key={b.name} href="#/markets/sectors" class="whitespace-nowrap hover:no-underline hover:text-ink">
              <span class="text-muted uppercase tracking-wider">{tl(b.name)}</span>{' '}
              <span class={avg >= 0 ? 'text-up' : 'text-down'}>{fmtPct(avg)}</span>
            </a>
          )
        })}
        <QuickAdd onAdd={onAdd} />
      </div>
      {canLeft && (
        <span class="absolute left-0 inset-y-0 flex items-center pr-1 bg-gradient-to-r from-black via-black/70 to-transparent">
          <button type="button" aria-label={tl('Scroll sectors left')}
            onClick={() => { const el = scroller.current
              el?.scrollTo({ left: Math.max(0, el.scrollLeft - 180), behavior: 'smooth' }) }}
            class="grid h-5 w-5 place-items-center rounded-full border border-line-2 bg-surface-2/80 text-muted hover:text-accent hover:border-accent/50">
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
          </button>
        </span>
      )}
      {canRight && (
        <span class="absolute right-0 inset-y-0 flex items-center pl-1 bg-gradient-to-l from-black via-black/70 to-transparent">
          <button type="button" aria-label={tl('Scroll sectors right')}
            onClick={() => { const el = scroller.current
              el?.scrollTo({ left: Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + 180), behavior: 'smooth' }) }}
            class="grid h-5 w-5 place-items-center rounded-full border border-line-2 bg-surface-2/80 text-muted hover:text-accent hover:border-accent/50">
            <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
          </button>
        </span>
      )}
    </div>
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

/** Toolbar hamburger, left of the sector strip: sort, select mode and the
 *  watchlist picker fold into one menu instead of three standalone controls
 *  (Jeff 2026-08-06: "saves a ton of space"). */
function BoardMenu({ sort, setSort, setViewMode, lists, listId, onSelectMode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const key = (e) => e.key === 'Escape' && setOpen(false)
    addEventListener('pointerdown', close)
    addEventListener('keydown', key)
    return () => { removeEventListener('pointerdown', close); removeEventListener('keydown', key) }
  }, [open])
  const SORTS = [
    ['manual', tl('Manual')], ['symbol', tl('Ticker')],
    ['change', `% ${tl('Reaction')}`], ['price', tl('Price')], ['spread', tl('Spread')],
  ]
  const head = (label) => (
    <div class="px-2.5 pt-1.5 pb-0.5 font-mono text-[8.5px] uppercase tracking-wider text-muted">{label}</div>
  )
  const item = (label, active, onClick) => (
    <button onClick={onClick}
      class={`w-full flex items-center gap-2 px-2.5 py-1 text-left font-anth text-[11px] hover:bg-accent-soft ${
        active ? 'text-accent' : 'text-ink-2'}`}>
      <span class={`w-3 shrink-0 text-[10px] ${active ? '' : 'invisible'}`}>✓</span>
      <span class="truncate">{label}</span>
    </button>
  )
  return (
    <div ref={ref} class="relative shrink-0">
      <button onClick={() => setOpen((v) => !v)} title={tl('board menu')}
        class={`grid h-[26px] w-[26px] place-items-center rounded-lg border bg-surface-1 ${
          open ? 'border-accent/60 text-accent' : 'border-line text-muted hover:text-accent hover:border-accent/50'}`}>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
        </svg>
      </button>
      {open && (
        <div class="absolute top-full left-0 mt-1 w-52 z-40 bg-surface-1/95 backdrop-blur border border-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.6)] py-1">
          {head(tl('Watchlist'))}
          {item(tl('Main board'), !listId, () => { setOpen(false); location.hash = '#/' })}
          {lists.map((l) => item(l.name, listId === l.id,
            () => { setOpen(false); location.hash = `#/watchlists/${l.id}` }))}
          <div class="my-1 border-t border-line/70" />
          {head(tl('Sort'))}
          {SORTS.map(([v, label]) => item(label, sort === v, () => {
            setOpen(false)
            setSort(v)
            // any real sort implies the flat view — grouped rows don't reorder
            if (v !== 'manual') setViewMode('flat')
          }))}
          <div class="my-1 border-t border-line/70" />
          {item(tl('select rows'), false, () => { setOpen(false); onSelectMode() })}
        </div>
      )}
    </div>
  )
}

/** The board's search box doubles as a global ticker lookup: type a company
 *  name ("Hynix") and every venue Yahoo knows drops down — the local rows
 *  keep filtering underneath, terminal not required (Jeff 2026-08-06). */
function TickerSearch({ filter, setFilter }) {
  const [hits, setHits] = useState(null)
  const [open, setOpen] = useState(false)
  // The box now rests folded to just the glass and blooms open on click —
  // at rest it was eating a third of the toolbar the sector strip wants
  // (Jeff 2026-08-06: "shorten the search bar usually until clicked").
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef(null)
  const boxRef = useRef(null)
  useEffect(() => {
    const q = filter.trim()
    if (q.length < 2) { setHits(null); return }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      searchSymbols(q, { signal: ctl.signal })
        .then((rows) => { setHits(rows); setOpen(true) })
        .catch(() => {})
    }, 280)
    return () => { clearTimeout(t); ctl.abort() }
  }, [filter])
  useEffect(() => {
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false) }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [])
  return (
    <div ref={boxRef} class="relative min-w-0">
      <span class="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
        <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.4" /><path d="m10.4 10.4 3 3" /></svg>
      </span>
      <input ref={inputRef} value={filter} onInput={(e) => setFilter(e.currentTarget.value)}
        onFocus={() => { setExpanded(true); if (hits?.length) setOpen(true) }}
        onClick={() => setExpanded(true)}
        onBlur={() => { if (!filter.trim()) setExpanded(false) }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          setOpen(false)
          if (!filter.trim()) { setExpanded(false); e.currentTarget.blur() }
        }}
        placeholder={expanded ? `${tl('Search')}…` : ''}
        aria-label={tl('Search')}
        class={`min-w-0 bg-surface-1 border border-line rounded-lg pl-6 py-1 font-anth text-[10px] text-ink outline-none focus:border-accent placeholder:text-muted transition-[width] duration-300 ease-out ${
          expanded ? 'w-36 sm:w-44 pr-2' : 'w-[26px] pr-0 cursor-pointer'}`} />
      {open && hits?.length > 0 && (
        <div class="absolute top-full left-0 mt-1 w-72 max-w-[80vw] z-40 bg-surface-1/95 backdrop-blur border border-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.6)] overflow-hidden">
          {hits.map((h) => (
            <div key={h.symbol}
              class="flex items-baseline gap-2 px-2.5 py-1.5 border-t border-line/60 first:border-0 hover:bg-accent-soft cursor-pointer"
              onClick={() => { setOpen(false); setFilter(''); location.hash = `#/research/${h.symbol.toLowerCase()}` }}>
              <span class="font-mono font-bold text-[11px] text-accent shrink-0">{h.symbol}</span>
              <span class="font-anth text-[10.5px] text-ink-2 truncate">{h.name}</span>
              <span class="ml-auto font-mono text-[8.5px] uppercase tracking-wider text-muted shrink-0">{h.exch}</span>
              <button
                title={isWatched(h.symbol) ? tl('on the board') : tl('add to watchlist')}
                onClick={(e) => { e.stopPropagation(); watch(h.symbol) }}
                class={`shrink-0 w-5 h-5 grid place-items-center rounded ${isWatched(h.symbol) ? 'text-accent' : 'text-muted hover:text-accent'}`}>
                {isWatched(h.symbol) ? '★' : '☆'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const [reordering, setReordering] = useState(false)
  // batch mode: tick rows, act once — one-star-at-a-time was the only way to
  // clear several names off the board (Jeff 2026-08-06)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const toggleSelect = (sym) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(sym)) next.delete(sym)
    else next.add(sym)
    return next
  })
  const endSelect = () => { setSelecting(false); setSelected(new Set()) }
  const batchRemove = () => { for (const s of selected) removeSymbol(s); endSelect() }
  const nudgeSymbol = activeList
    ? (sym, d) => moveWatchlistSymbol(activeList.id, sym, d)
    : moveSymbol
  const dropSymbol = activeList
    ? (sym, before) => moveWatchlistSymbol(activeList.id, sym, { before })
    : placeSymbol
  // successive inserts before the first UNselected row land the picks at the
  // top in their current relative order
  const batchTop = () => {
    const sel = watchlist.filter((s) => selected.has(s))
    const anchor = watchlist.find((s) => !selected.has(s))
    if (anchor) for (const s of sel) dropSymbol(s, anchor)
    endSelect()
  }

  // 10s tick keeps the "updated" line and stale banner honest between fetches.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10_000)
    return () => clearInterval(t)
  }, [])
  const all = watchlist.map((s) => quotes[s]?.quote).filter((q) => q?.pct != null)
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
              class={`px-2 py-0.5 rounded-md font-anth text-[10px] transition-colors ${viewMode === 'grouped' ? 'bg-accent-2-soft text-accent-2' : 'text-muted hover:text-ink'}`}>
              {tl('Sectors')}
            </button>
            <button onClick={() => setViewMode('flat')}
              class={`px-2 py-0.5 rounded-md font-anth text-[10px] transition-colors ${viewMode === 'flat' ? 'bg-accent-2-soft text-accent-2' : 'text-muted hover:text-ink'}`}>
              {tl('All')}
            </button>
          </div>
          <TickerSearch filter={filter} setFilter={setFilter} />
        </div>

        {/* batch trigger sits left of the sector strip; while active the
            strip yields its slot to the action bar (Jeff 2026-08-06) */}
        {selecting ? (
          <div class="md:ml-auto flex items-center gap-1.5 px-1 pb-2 md:px-0 md:pb-0 font-mono text-[10px] whitespace-nowrap overflow-x-auto no-scrollbar">
            <span class="text-muted">{selected.size} {tl('selected')}</span>
            <button onClick={() => setSelected(new Set(viewMode === 'flat' ? flatRows.map((r) => r.symbol) : visibleManual))}
              class="px-2 py-0.5 rounded border border-line text-ink-2 hover:border-accent hover:text-accent">
              {tl('select all')}
            </button>
            <button onClick={batchTop} disabled={!selected.size}
              class="px-2 py-0.5 rounded border border-line text-ink-2 hover:border-accent hover:text-accent disabled:opacity-40 disabled:pointer-events-none">
              {tl('top')}
            </button>
            <button onClick={batchRemove} disabled={!selected.size}
              class="px-2 py-0.5 rounded border border-line text-ink-2 hover:border-down hover:text-down disabled:opacity-40 disabled:pointer-events-none">
              {tl('remove')}
            </button>
            <button onClick={endSelect}
              class="px-2 py-0.5 rounded border border-accent text-accent hover:bg-accent hover:text-black font-semibold">
              {tl('done')}
            </button>
          </div>
        ) : (
          <div class="flex items-center gap-2 min-w-0 md:flex-1 md:ml-auto max-md:px-1">
            <BoardMenu sort={sort} setSort={setSort} setViewMode={setViewMode}
              lists={namedWatchlists} listId={activeList?.id || null}
              onSelectMode={() => setSelecting(true)} />
            {/* Thesis strip: bucket averages at a glance. One swipeable line at
                every width — it wrapped to four lines of prime real estate
                (Jeff 2026-08-04: "keep it all on one line somehow"). */}
            <SectorScroller watchlist={watchlist} quotes={quotes} onAdd={addSymbol} />
          </div>
        )}
      </div>

      {/* lg (1024px) not xl: the rail used to vanish one browser-zoom notch in.
          1024 keeps it alive through two more notches (115%, 125%) on a 1376px
          CSS viewport before genuinely running out of room. */}
      <div class="grid gap-2 lg:grid-cols-[1fr_230px] min-w-0">
        <section class="@container bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
          {reordering ? (
            <ReorderList watchlist={watchlist} quotes={quotes}
              onMove={nudgeSymbol} onPlace={dropSymbol}
              onDone={() => setReordering(false)} />
          ) : viewMode === 'grouped' ? ordered.map((g, gi) => {
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
                            class="text-[10px] text-muted hover:text-ink px-1" title={tl('move up')}>↑</button>
                    <button onClick={(e) => { e.stopPropagation(); moveGroup(g.name, 1, names) }}
                            class="text-[10px] text-muted hover:text-ink px-1" title={tl('move down')}>↓</button>
                  </span>
                </div>
                {!folded && g.symbols.map((s) => (
                  <TuiRow key={s} symbol={s} data={quotes[s]} earnDays={earnDays[s]}
                    onRemove={removeSymbol} selecting={selecting}
                    selected={selected.has(s)} onToggleSelect={toggleSelect} />
                ))}
              </div>
            )
          }) : flatRows.map(({ symbol }) => (
            <TuiRow key={symbol} symbol={symbol} data={quotes[symbol]} earnDays={earnDays[symbol]}
              onRemove={removeSymbol} selecting={selecting}
              selected={selected.has(symbol)} onToggleSelect={toggleSelect} />
          ))}
          {!watchlist.length && (
            <div class="px-3 py-8 text-center font-anth text-[11px] text-muted">{tl('empty watchlist — add the first ticker below')}</div>
          )}
          {!reordering && (
            <AddSymbolRow onAdd={addSymbol} isPresent={isPresent}
              onReorder={() => setReordering(true)} />
          )}
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
