import { useEffect, useRef, useState } from 'preact/hooks'
import { createChart, AreaSeries } from 'lightweight-charts'
import { boundedTimeScale } from '../lib/chartview.js'
import { useNamedWatchlists, useQuotes, useWatchlist } from '../hooks.js'
import { etParts, marketState, rollCashSession } from '../lib/marketState.js'
import { BUCKETS } from '../lib/symbols.js'
import { pulseStats } from '../lib/pulse.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { EARNINGS_UNIVERSE, EARNINGS_NAMES, ECON_EVENTS, MARKET_DECK, upcomingEvents, eventDayLabel } from '../lib/markets.js'
import { loadCatalysts, onCatalystsChange, mergedEvents } from '../lib/catalysts.js'
import { fetchHistory, prefetchSymbol } from '../lib/history.js'
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
import { groupHeat, rankAlerts, rangeExtremes } from '../lib/railstats.js'
import { conditionText, loadAlerts, onAlertsChange } from '../lib/alerts.js'
import { groupDashboardRows, quoteSpread, selectFlatRows } from '../lib/dashboardRows.js'
import { searchSymbols } from '../lib/symbolSearch.js'
import { venueFlag } from '../lib/venueFlag.js'
import { fmtPrice, fmtPriceBare, fmtPct, fmtChange, fmtVol, rangePos } from '../lib/format.js'
import { Histo } from '../components/Histo.jsx'
import { Spark } from '../components/Spark.jsx'
import { SPARK_TYPES, DEFAULT_SPARK, isSparkType,
  SPARK_WINDOWS, DEFAULT_WINDOW, isSparkWindow, normalizeSparkWindow,
  historyBarsToSparkBars } from '../lib/sparks.js'
import { Marquee } from '../components/Marquee.jsx'
import { FlashMetric, FlashPrice } from '../components/Fig.jsx'
import { Empty } from '../components/Loading.jsx'
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

/** Cash-session sparklines are intentionally demand-driven: the daily feed
 *  remains the cheap default, and this fan-out only exists while DAY is the
 *  selected window. Requests are staggered so a large board does not stampede
 *  the proxy, then refreshed once a minute while the cash session is open. */
function useIntradaySparks(symbols, enabled) {
  const [rows, setRows] = useState({})
  const session = useRef(null)
  const lastState = useRef(null)
  useEffect(() => {
    if (!enabled) return
    let dead = false
    let timers = []
    const refresh = (initial = false) => {
      const now = new Date()
      const state = marketState(now).state
      const nextSession = rollCashSession(session.current, now)
      if (nextSession !== session.current) {
        session.current = nextSession
        setRows({})
      }
      // One final pull on the open→post transition captures the closing bar.
      const shouldFetch = initial || state === 'open'
        || (lastState.current === 'open' && state === 'post')
      lastState.current = state
      if (!shouldFetch) return
      timers.forEach(clearTimeout)
      timers = symbols.map((symbol, i) => setTimeout(() => {
        if (dead) return
        fetchHistory(symbol, '1D')
          .then((history) => {
            if (dead) return
            const activeSession = session.current
            const bars = activeSession
              ? history.bars.filter((bar) => etParts(new Date(bar.time * 1000)).iso === activeSession)
              : history.bars
            setRows((current) => ({ ...current, [symbol]: historyBarsToSparkBars(bars) }))
          })
          .catch(() => { if (!dead) setRows((current) => ({ ...current, [symbol]: [] })) })
      }, i * 160))
    }
    refresh(true)
    const interval = setInterval(refresh, 60_000)
    return () => {
      dead = true
      clearInterval(interval)
      timers.forEach(clearTimeout)
    }
  }, [enabled, symbols.join(',')])
  return enabled ? rows : {}
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
  // A quote that hasn't filled its day range yet used to drop the whole block,
  // which collapsed the meter cell and shifted VOL/AVG left on that row alone —
  // the ragged column Jeff kept hitting (2026-08-06). Hold the space instead.
  if (pos == null) {
    return (
      <span aria-hidden="true"
        class={`hidden @min-[730px]:flex items-center gap-[3px] font-mono text-[11px] font-normal whitespace-nowrap invisible ${cls}`}>
        <span class="text-[9px] w-6">{label}</span>
        <span class="w-[3.15rem] text-right">0000.00</span>
        <span class="w-14 h-[3px] shrink-0 mx-1" />
        <span class="w-[3.15rem]">0000.00</span>
      </span>
    )
  }
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
  if (pos == null) {
    return (
      <span aria-hidden="true"
        class={`hidden @min-[545px]:flex @min-[730px]:hidden items-center gap-1 whitespace-nowrap font-mono text-[9.5px] invisible ${cls}`}>
        <span class="text-[9px]">DAY</span>
        <span class="w-11 text-right">0000.00</span>
        <span class="w-12 h-[3px] shrink-0" />
        <span class="w-11">0000.00</span>
      </span>
    )
  }
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

function TuiRow({ symbol, data, earnDays, onRemove, selecting, selected, onToggleSelect,
                   spark = DEFAULT_SPARK, sparkWin = DEFAULT_WINDOW,
                   intradayBars = null, revealed = false, onReveal }) {
  const q = data?.quote
  // Touch has no hover, so a tap on the ticker used to jump straight to the
  // symbol page and the name was unreachable (Jeff 2026-08-05). First tap
  // reveals it, second follows the link — and only where the name isn't
  // already sitting inline.
  //
  // The open row is BOARD state, not row state: per-row flags meant every
  // name you ever tapped stayed open and the board slowly turned into a list
  // of company names (Jeff 2026-08-07). One at a time, tap again to close.
  const identityRef = useRef(null)
  const onIdentityTap = (e) => {
    if (revealed || !matchMedia('(hover: none)').matches) return
    const inline = identityRef.current?.querySelector('[data-inline-name]')
    if (inline && inline.offsetParent !== null) return
    e.preventDefault()
    e.stopPropagation()
    onReveal?.(symbol)
  }
  const up = (q?.pct ?? 0) >= 0
  const extUp = (q?.extPct ?? 0) >= 0
  const heavy = (data?.tech?.volRatio ?? 0) >= 1.5
  // the 20-day average the ratio was measured against — VOL alone says
  // nothing without it, and it costs no extra fetch
  const avgVol = q?.volume != null && data?.tech?.volRatio
    ? q.volume / data.tech.volRatio : null
  const hasRange = q?.dayHigh != null && q?.dayLow != null && q?.price > 0
  return (
    <a
      href={`#/research/${symbol.toLowerCase()}`}
      onMouseEnter={() => prefetchSymbol(symbol)}
      onClick={(e) => { if (selecting) { e.preventDefault(); e.stopPropagation(); onToggleSelect(symbol) } }}
      class={`tui-row group/row relative block px-3 py-[3px] border-b border-line last:border-0 hover:no-underline${
        selecting ? ' pl-9 cursor-pointer' : ''}${selected ? ' bg-accent-soft' : ' hover:bg-white/[0.035]'}${revealed ? ' is-revealed' : ''}${
        q?.name && !q?.extLabel ? ' has-inline-name' : ''}`}
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
                /* the mid band truncated the name with no way to read the rest
                   — same hover-scroll the wide band uses (Jeff 2026-08-06).
                   During regular hours there is no PRE/AH print on a phone
                   row, and that spare width shows the company name instead of
                   sitting empty (Jeff, same day). */
                <span data-inline-name class={`${q?.extLabel ? 'hidden @min-[545px]:block' : 'block'} @min-[820px]:hidden min-w-0`}>
                  <Marquee text={q.name} title={`${symbol} — ${q.name}`}
                    class="block min-w-0 text-[10.5px] text-muted font-normal font-anth" />
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
                  while narrower ones still line up. Reserving it below 820px
                  cost the company name ~40px it needed more (Jeff 2026-08-07:
                  "the company names r cut off") — under that the columns size
                  to content and hand the slack to the name gutter. */}
              {q && (
                <span class={`${up ? 'text-up' : 'text-down'} whitespace-nowrap @min-[820px]:min-w-[7.7rem] shrink-0`}>
                  {up ? '▲' : '▼'} <FlashMetric value={q.change} fmt={fmtAbsChange} kind="change" />{' '}
                  <span class="font-normal text-[11px] max-sm:text-[10px]">
                    (<FlashMetric value={q.pct} fmt={fmtPct} kind="change" />)
                  </span>
                </span>
              )}
              {/* extended hours reads a tier below the regular quote — on a
                  phone it was the same size as the print and clipped off the
                  right edge (Jeff 2026-08-04) */}
              {q?.extLabel && q.extPrice != null ? (
                <span class="whitespace-nowrap text-[11px] max-sm:text-[10px] shrink-0 max-sm:ml-auto @min-[820px]:min-w-[9.4rem] @min-[545px]:text-right">
                  {/* only the PERCENT drops a weight tier (Jeff 2026-08-06);
                      the extended price keeps its weight and runs a size
                      bigger than the tag beside it — it's the figure you read,
                      the tag and the % are its annotations */}
                  <span class={`font-semibold ${extendedLabelClass(q.extLabel)}`}>{q.extLabel}</span>{' '}
                  {/* NO flash on extended prints: overnight sessions tick all
                      night (AAPL ON via Blue Ocean measured flashing 68×/45s),
                      strobing the row nonstop — "dimming shimmer on the AAPL
                      row" (Jeff 2026-08-11). The regular print keeps its flash;
                      the ext annotation just updates. */}
                  <span class="text-ink-2 font-semibold text-[12px] max-sm:text-[11px]">{fmtPriceBare(q.extPrice)}</span>{' '}
                  <span class={`font-normal ${extUp ? 'text-up' : 'text-down'}`}>
                    {extUp ? '▲' : '▼'}{Math.abs(q.extPct ?? 0).toFixed(1)}%
                  </span>
                </span>
              ) : marketState(new Date()).state !== 'open' ? (
                /* ghost slot: a row whose extended print hasn't loaded used to
                   let the name gutter grow and right-shift the whole quote
                   cluster off the column grid (Jeff 2026-08-06) */
                <span class="whitespace-nowrap text-[11px] max-sm:hidden shrink-0 invisible @min-[820px]:min-w-[9.4rem] @min-[545px]:text-right" aria-hidden="true">
                  {/* mirrors the real print part for part, including the
                      larger price — a ghost narrower than the thing it
                      reserves space for lets the column shift when data lands */}
                  <span class="font-semibold">PM</span>{' '}
                  <span class="font-semibold text-[12px]">0000.00</span>{' '}
                  <span class="font-normal">▼0.0%</span>
                </span>
              ) : null}
            </span>
          </div>
          {/* Phone width: badges scroll sideways instead of clipping mid-badge. */}
          <div class="flex items-center gap-2.5 pt-[2px] pl-0 min-w-0 @min-[430px]:overflow-hidden max-sm:overflow-x-auto no-scrollbar">
            {/* Container-relative width changes continuously with zoom. A
                breakpoint used to turn this from postage stamp to runway. */}
            <Spark type={spark} window={sparkWin}
              bars={sparkWin === 'DAY' ? intradayBars : data?.histo} width={150} height={24}
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
            <CompactDayRange lo={q?.dayLow} hi={q?.dayHigh} v={q?.price}
              cls="ml-auto shrink-0 pr-1" />
          </div>
        </div>
        {/* Meters live in their own fixed column so DAY and 52W align by
            construction — sharing the text rows made them wrap and overflow
            once the row ran out of width (Jeff 2026-08-03). */}
        <div class="hidden @min-[545px]:flex shrink-0 flex-col justify-center gap-1 font-mono text-[11px]">
          <span class="flex items-baseline gap-1.5">
            {/* the compact range lives on the badge line at this width for
                EVERY row — keeping it here made the two meter lines different
                widths (AVG landed 169px left of VOL) and adding a matching
                ghost squeezed the identity slot off screen instead */}
            <RangeBar label="DAY" lo={q?.dayLow} hi={q?.dayHigh} v={q?.price} />
            <span class="flex items-baseline justify-end gap-1 w-[4.6rem] @min-[820px]:w-[9.2rem] whitespace-nowrap">
              <span class="hidden @min-[820px]:flex items-baseline gap-1 mr-1">
                <span class="text-accent/60 text-[9px] w-6 text-right">{q && quoteSpread(q) != null ? 'SPR' : ''}</span>
                <span class="text-ink-2 font-normal w-[2.6rem] text-right">
                  {q && quoteSpread(q) != null ? fmtSpread(quoteSpread(q)) : ''}
                </span>
              </span>
              <span class="text-accent/70 w-6 text-right">{q?.volume != null ? 'VOL' : ''}</span>
              <span class={`w-[2.9rem] text-right ${heavy ? 'text-accent' : 'text-ink'}`}>
                {q?.volume != null ? fmtVol(q.volume) : ''}
              </span>
            </span>
          </span>
          <span class="flex items-baseline gap-1.5">
            {/* always rendered: RangeBar ghosts its own width when the 52W
                numbers haven't arrived, and skipping the element outright
                collapsed the second meter line and slid AVG left */}
            <RangeBar label="52W" lo={data?.tech?.low52} hi={data?.tech?.high52} v={q?.price} />
            <span class="flex items-baseline justify-end gap-1 w-[4.6rem] @min-[820px]:w-[9.2rem] whitespace-nowrap">
              <span class="hidden @min-[820px]:flex items-baseline gap-1 mr-1">
                <span class="text-accent/60 text-[9px] w-6 text-right">{hasRange ? 'RNG' : ''}</span>
                <span class="text-ink-2 font-normal w-[2.6rem] text-right">
                  {hasRange ? `${(((q.dayHigh - q.dayLow) / q.price) * 100).toFixed(1)}%` : ''}
                </span>
              </span>
              <span class="text-accent/60 text-[9px] w-6 text-right">{avgVol != null ? 'AVG' : ''}</span>
              <span class="text-ink-2 font-normal w-[2.9rem] text-right">
                {avgVol != null ? fmtVol(avgVol) : ''}
              </span>
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
  // collapsed = header only; the two headline stats ride the header so a
  // minimized pulse still says whether the tape is green (Jeff 2026-08-09)
  const [min, setMin] = useState(() => localStorage.getItem('rail_pulse_min') === '1')
  const toggleMin = () => {
    setMin((v) => {
      localStorage.setItem('rail_pulse_min', v ? '0' : '1')
      return !v
    })
  }
  if (!s) return null
  const tone = (v) => (v >= 0 ? 'text-up' : 'text-down')
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden flex flex-col max-h-[42vh]">
      <header class="flex items-center gap-2 px-3 py-[3px] border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Pulse')}</h2>
        {min && (
          <span class="font-mono text-[10px]">
            <span class={s.adv >= s.dec ? 'text-up' : 'text-down'}>{s.adv}/{s.dec}</span>
            {' '}
            <span class={tone(s.avg)}>{fmtPct(s.avg)}</span>
          </span>
        )}
        <button onClick={toggleMin} aria-expanded={!min}
          title={min ? tl('expand') : tl('minimize')}
          class="ml-auto font-mono text-[11px] leading-none px-1 text-muted hover:text-ink">
          {min ? '+' : '−'}
        </button>
      </header>
      {!min && (
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
      )}
    </section>
  )
}

const ECON_COLORS = {
  FOMC: 'text-down', CPI: 'text-accent', NFP: 'text-accent',
  GDP: 'text-[#00c8ff]', PCE: 'text-[#c084fc]',
  // second/third tier keep a quieter shade so the rate-and-inflation prints
  // still win the row at a glance
  MINS: 'text-[#c084fc]', ISM: 'text-[#5ba8d9]', ISMS: 'text-[#5ba8d9]',
  UMCH: 'text-ink-2', PPI: 'text-ink-2', RET: 'text-ink-2',
}

function MacroCalPanel() {
  const [cats, setCats] = useState(loadCatalysts)
  useEffect(() => onCatalystsChange(setCats), [])
  // One day of look-back. A print that landed yesterday is still the thing
  // you are reasoning about this morning, and dropping it the moment the clock
  // rolls over loses the most relevant row on the board (Jeff 2026-08-07).
  const events = mergedEvents(ECON_EVENTS, cats, new Date().toISOString().slice(0, 10), 60, 1).slice(0, 12)
  if (!events.length) return null
  const dayCls = (d) =>
    d < 0 ? 'text-muted/60'                       // already happened — present, not shouting
      : d === 0 ? 'text-imminent font-bold'
      : d <= 3 ? 'text-down font-bold' : d <= 7 ? 'text-down'
      : d <= 30 ? 'text-accent' : 'text-muted'
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden flex flex-col max-h-[42vh]">
      <header class="flex items-center px-3 py-[3px] border-b border-line-2 bg-surface-2">
        <a href="#/markets/calendar" class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase hover:no-underline">
          {tl('Calendar')}
        </a>
        <a href="#/markets/calendar" aria-label={tl('Open calendar')} class="ml-auto text-[12px] leading-none text-muted hover:text-accent hover:no-underline">→</a>
      </header>
      <div class="overflow-y-auto min-h-0">
      <div class="py-1">
        {events.map((e) => {
          // every row goes somewhere: a ticker catalyst to its research page,
          // everything else to the full calendar (Jeff 2026-08-06)
          const href = e.user && e.symbol && e.symbol !== 'MACRO'
            ? `#/research/${e.symbol.toLowerCase()}` : '#/markets/calendar'
          return (
            <a key={`${e.date}-${e.type}-${e.id ?? ''}`} href={href}
              class="flex items-baseline gap-2 px-3 py-[2px] font-mono text-[11px] hover:bg-surface-3 hover:no-underline">
              <span class={`w-10 font-bold shrink-0 truncate ${e.user ? 'text-[#00c8ff]' : ECON_COLORS[e.type] || 'text-ink-2'}`}>
                {e.user ? (e.symbol === 'MACRO' ? e.type : e.symbol) : e.type}
              </span>
              <span class="text-muted flex-1 truncate">{e.user ? e.rawLabel : tl(e.label)}</span>
              <span class={dayCls(e.days)}>{e.days === 0 ? tl('today') : eventDayLabel(e.days)}</span>
            </a>
          )
        })}
      </div>
    </div>
    </section>
  )
}

function MarketDeckPanel() {
  const quotes = useQuotes(MARKET_DECK.map((item) => item.symbol))
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden flex flex-col">
      <header class="flex items-center px-3 py-[3px] border-b border-line-2 bg-surface-2">
        <a href="#/markets" class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase hover:no-underline">
          {tl('Global markets')}
        </a>
        <a href="#/markets" aria-label={tl('Open markets')} class="ml-auto text-[12px] leading-none text-muted hover:text-accent hover:no-underline">→</a>
      </header>
      <div class="grid grid-cols-2 py-1">
        {MARKET_DECK.map((item) => {
          const q = quotes[item.symbol]?.quote
          return (
            <a key={item.symbol} href={`#/research/${item.symbol.toLowerCase()}`}
              class="min-w-0 flex items-baseline gap-1.5 px-2.5 py-[3px] hover:bg-surface-3 hover:no-underline odd:border-r odd:border-line">
              {/* label ≠ value: micro-caps label in the quiet shade, tabular
                  number carrying the color — they used to blur into one line
                  (Jeff 2026-08-06: "something visually unsatisfying") */}
              <span class="font-anth text-[9px] font-medium uppercase tracking-[0.08em] text-muted/80 truncate">{tl(item.label)}</span>
              <span class={`ml-auto shrink-0 font-tick text-[11px] font-semibold tabular-nums ${!q ? 'text-muted' : q.pct >= 0 ? 'text-up' : 'text-down'}`}>
                {q ? fmtPct(q.pct) : '—'}
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

function EarningsPanel({ symbols, quotes = {} }) {
  // the board's names plus the megacaps whose prints move the whole tape —
  // a widget that misses NVDA's report because it fell off the watchlist is
  // not doing its one job (Jeff 2026-08-06)
  const uni = [...new Set([...symbols, ...EARNINGS_UNIVERSE])]
  const days = useEarningsDays(uni)
  const held = new Set(symbols)
  const upcoming = uni
    .filter((s) => days[s] != null)
    .map((s) => ({ symbol: s, d: days[s] }))
    .sort((a, b) => a.d - b.d || (held.has(b.symbol) - held.has(a.symbol)))
    .slice(0, 10)
  if (!upcoming.length) return null
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden flex flex-col max-h-[42vh]">
      <header class="flex items-center px-3 py-[3px] border-b border-line-2 bg-surface-2">
        <a href="#/markets/earnings" class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase hover:no-underline">
          {tl('Earnings')}
        </a>
        <a href="#/markets/earnings" aria-label={tl('Open earnings')} class="ml-auto text-[12px] leading-none text-muted hover:text-accent hover:no-underline">→</a>
      </header>
      <div class="overflow-y-auto min-h-0">
      <div class="py-1">
        {upcoming.map(({ symbol, d }) => {
          // the quote feed already carries shortName — no extra fetch;
          // universe-only names have no quote here and just show the ticker
          // quote feed first (it's live), static universe map second — the
          // widget lists names you don't hold, which have no quote at all
          const name = quotes[symbol]?.quote?.name || EARNINGS_NAMES[symbol] || ''
          const mine = held.has(symbol)
          return (
            <a key={symbol} href={`#/research/${symbol.toLowerCase()}/earnings`}
              class="grid grid-cols-[2.55rem_minmax(0,1fr)_2rem] items-baseline gap-1.5 px-3 py-[2px] font-mono text-[11px] hover:bg-surface-3 hover:no-underline"
              title={name || symbol}>
              <span class={`font-[650] font-anth truncate ${mine ? 'text-ink' : 'text-ink-2'}`}>{symbol}</span>
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
function ReorderList({ watchlist, quotes, onMove, onPlace, onRemove, onDone }) {
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
              <button onClick={() => onRemove(s)} title={tl('remove')}
                class="w-6 h-6 grid place-items-center rounded text-muted hover:text-down hover:bg-surface-2">×</button>
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
  // same company-name lookup the toolbar search runs, so "hynix" resolves to
  // a ticker down here too (Jeff 2026-08-06) — the box itself is untouched,
  // the hits hang ABOVE it because this row sits at the bottom of the list
  const [hits, setHits] = useState(null)
  const [active, setActive] = useState(-1)
  const input = useRef(null)
  const boxRef = useRef(null)
  useEffect(() => { if (open) input.current?.focus() }, [open])
  // a dropdown left hanging over the rows after the user clicks away reads as
  // a stuck overlay — same outside-pointerdown dismissal the toolbar uses
  useEffect(() => {
    const away = (e) => { if (!boxRef.current?.contains(e.target)) { setHits(null); setActive(-1) } }
    addEventListener('pointerdown', away)
    return () => removeEventListener('pointerdown', away)
  }, [])
  useEffect(() => {
    const q = sym.trim()
    if (!open || q.length < 2) { setHits(null); setActive(-1); return }
    const ctl = new AbortController()
    const t = setTimeout(() => {
      searchSymbols(q, { signal: ctl.signal })
        .then((rows) => { setHits(rows.slice(0, 5)); setActive(-1) })
        .catch(() => {})
    }, 280)
    return () => { clearTimeout(t); ctl.abort() }
  }, [sym, open])
  const close = () => { setOpen(false); setSym(''); setErr(''); setHits(null); setActive(-1) }
  // a successful add RESETS the form instead of closing it — mass-adding
  // tickers shouldn't cost a click per symbol (Jeff 2026-08-09); esc/✕ closes
  const added = () => { setSym(''); setErr(''); setHits(null); setActive(-1); input.current?.focus() }
  const commit = (raw) => {
    const v = String(raw || '').trim().toUpperCase()
    if (!v) return close()
    if (onAdd(v)) return added()
    setErr(isPresent(v) ? `${v} ${tl('already on the list')}` : `${tl('not a symbol')}: ${v}`)
  }
  // ↑/↓ walk the dropdown, Enter takes the highlighted hit — with nothing
  // highlighted Enter still submits whatever was typed, so a known ticker
  // never has to wait for the network
  const onKey = (e) => {
    if (e.key === 'Escape') {
      if (hits?.length) { setHits(null); setActive(-1) } else close()
      return
    }
    if (!hits?.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % hits.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? hits.length : i) - 1) }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); commit(hits[active].symbol) }
  }
  const submit = (e) => {
    e.preventDefault()
    const v = sym.trim().toUpperCase()
    if (!v) return close()
    if (onAdd(v)) return added()
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
    <form ref={boxRef} onSubmit={submit} class="relative flex items-center gap-2 border-t border-line px-3 py-1.5">
      {hits?.length > 0 && (
        <div class="absolute bottom-full left-2 mb-1 w-[26rem] max-w-[88vw] z-40 bg-surface-1/95 backdrop-blur border border-line rounded-lg shadow-[0_-8px_24px_rgba(0,0,0,0.6)] overflow-hidden">
          {hits.map((h, i) => (
            <button key={h.symbol} type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => commit(h.symbol)}
              class={`w-full flex items-baseline gap-2 px-2.5 py-1.5 border-t border-line/60 first:border-0 text-left ${
                i === active ? 'bg-accent-soft' : 'hover:bg-accent-soft'}`}>
              {venueFlag(h) && (
                <img src={venueFlag(h)} alt="" class="w-4 h-3 rounded-[1px] shrink-0 self-center"
                  title={h.exch} />
              )}
              <span class="font-mono font-bold text-[11px] text-accent shrink-0">{h.symbol}</span>
              <span class="font-anth text-[10.5px] text-ink-2 truncate">{h.name}</span>
              <span class="ml-auto font-mono text-[8.5px] uppercase tracking-wider text-muted shrink-0">{h.exch}</span>
            </button>
          ))}
        </div>
      )}
      <input
        ref={input}
        value={sym}
        onInput={(e) => { setSym(e.currentTarget.value); setErr('') }}
        onKeyDown={onKey}
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



/** The fear gauges on one card: the vol complex plus credit, the dials that
 *  say whether a red tape is noise or the start of something. */
const RISK_DECK = [
  { symbol: '^VIX', label: 'VIX' },
  { symbol: '^VIX9D', label: 'VIX 9D' },
  { symbol: '^VVIX', label: 'VVIX' },
  { symbol: '^MOVE', label: 'MOVE' },
  { symbol: '^SKEW', label: 'SKEW' },
  { symbol: 'HYG', label: 'HY credit' },
]

function RiskPanel() {
  const quotes = useQuotes(RISK_DECK.map((d) => d.symbol))
  const vix = quotes['^VIX']?.quote?.price
  const vix9 = quotes['^VIX9D']?.quote?.price
  // 9D above 30D = the stress is NOW, not priced later — the single most
  // useful read on this card, so it gets named instead of implied
  const inverted = vix != null && vix9 != null && vix9 > vix
  return (
    <div class="py-1">
      {RISK_DECK.map(({ symbol, label }) => {
        const q = quotes[symbol]?.quote
        const up = (q?.pct ?? 0) >= 0
        return (
          <a key={symbol} href={`#/research/${symbol.toLowerCase()}`}
            class="flex items-baseline gap-2 px-3 py-[2px] font-mono text-[10.5px] hover:bg-surface-3 hover:no-underline">
            <span class="font-anth text-muted w-[3.9rem] shrink-0 truncate">{tl(label)}</span>
            <span class={`ml-auto ${symbol === '^VIX' && q?.price > 25 ? 'text-down font-bold' : 'text-ink-2'}`}>
              {q ? fmtPrice(q.price) : '—'}
            </span>
            <span class={`w-[3.4rem] text-right ${symbol === 'HYG' ? (up ? 'text-up' : 'text-down') : (up ? 'text-down' : 'text-up')}`}>
              {q ? fmtPct(q.pct) : ''}
            </span>
          </a>
        )
      })}
      {inverted && (
        <div class="mx-3 mt-1 mb-0.5 rounded border border-down/40 bg-down/10 px-2 py-0.5 font-mono text-[9.5px] text-down">
          {tl('9D over 30D — term structure inverted')}
        </div>
      )}
    </div>
  )
}

/** Where the money moved today, by group. Ranked so the rotation reads off
 *  the top row instead of out of thirty individual % cells. */
function HeatPanel({ watchlist, quotes }) {
  const [, bump] = useState(0)
  useEffect(() => onUserGroupsChange(() => bump((n) => n + 1)), [])
  const groups = groupDashboardRows(watchlist, loadUserGroups())
  const rows = groupHeat(groups, quotes)
  if (!rows.length) return null
  const span = Math.max(...rows.map((r) => Math.abs(r.avg)), 0.5)
  return (
    <div class="py-1">
      {rows.map((r) => (
        // the bar is the row's BACKGROUND, not a column — the rail is ~200px
        // wide and a dedicated bar cell got squeezed to nothing between the
        // name and the number
        <div key={r.name} class="relative px-3 py-[3px] flex items-center gap-2 overflow-hidden">
          <span class={`absolute inset-y-[2px] left-0 rounded-r-sm ${r.avg >= 0 ? 'bg-up/15' : 'bg-down/15'}`}
            style={`width:${Math.max(4, Math.min(100, (Math.abs(r.avg) / span) * 100))}%`} />
          <span class="relative font-anth text-[10px] text-ink-2 truncate flex-1">{r.name}</span>
          <span class="relative font-mono text-[9px] text-muted shrink-0">{r.up}/{r.count}</span>
          <span class={`relative font-mono text-[10.5px] w-[3.4rem] text-right shrink-0 ${r.avg >= 0 ? 'text-up' : 'text-down'}`}>
            {fmtPct(r.avg)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Armed alerts, nearest to firing first — the rail's job is to say "this one
 *  is 0.4% away", not to make you open the alerts page to find out. */
function AlertsPanel({ quotes }) {
  const [, bump] = useState(0)
  useEffect(() => onAlertsChange(() => bump((n) => n + 1)), [])
  const priceMap = {}
  for (const [sym, entry] of Object.entries(quotes || {})) {
    const p = entry?.quote?.price
    if (Number.isFinite(p)) priceMap[sym] = p
  }
  const ranked = rankAlerts(loadAlerts(), priceMap).slice(0, 6)
  if (!ranked.length) {
    return <div class="px-3 py-3 font-anth text-[10px] text-muted">{tl('no alerts armed')}</div>
  }
  return (
    <div class="py-1">
      {ranked.map(({ alert, gap }) => (
        <a key={alert.id} href="#/alerts"
          class="flex items-center gap-2 px-3 py-[3px] font-mono text-[10.5px] hover:bg-surface-3 hover:no-underline">
          <span class="text-ink font-bold w-[3.2rem] shrink-0">{alert.symbol}</span>
          <span class="text-muted truncate flex-1">
            {conditionText(alert).replace(new RegExp(`^${alert.symbol}\\s+`), '')}
          </span>
          {alert.triggered ? (
            <span class="text-accent-2 shrink-0">{tl('hit')}</span>
          ) : gap == null ? (
            <span class="text-muted shrink-0">—</span>
          ) : (
            <span class={`shrink-0 ${gap >= 0 ? 'text-up' : 'text-ink-2'}`}>{fmtPct(gap)}</span>
          )}
        </a>
      ))}
    </div>
  )
}

/** Names pinned to the top or bottom of their own session range — breakouts
 *  and breakdowns announce themselves here before the % column notices. */
function RangePanel({ quotes }) {
  const { highs, lows } = rangeExtremes(quotes)
  if (!highs.length && !lows.length) {
    return <div class="px-3 py-3 font-anth text-[10px] text-muted">{tl('nothing at its extremes')}</div>
  }
  // the marker says WHERE in the day's range it's printing; the colour stays
  // tied to the day's move, so "up on the day but pinned to the low" — the
  // fade that matters — is legible in one glance instead of two conventions
  const row = (r, mark, markCls) => (
    <a key={r.symbol} href={`#/research/${r.symbol.toLowerCase()}`}
      class="flex items-center gap-2 px-3 py-[3px] font-mono text-[10.5px] hover:bg-surface-3 hover:no-underline">
      <span class={`shrink-0 ${markCls}`}>{mark}</span>
      <span class="text-ink font-bold flex-1">{r.symbol}</span>
      <span class="text-muted text-[9px] shrink-0">{Math.round(r.pos * 100)}%</span>
      <span class={`w-[3.4rem] text-right shrink-0 ${r.pct >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(r.pct)}</span>
    </a>
  )
  return (
    <div class="py-1">
      {highs.map((r) => row(r, '▲', 'text-up'))}
      {highs.length > 0 && lows.length > 0 && <div class="my-1 border-t border-line/70" />}
      {lows.map((r) => row(r, '▼', 'text-down'))}
    </div>
  )
}

/** Watchlist split into bucket groups (TUI's `── group ──` separators).
 *  User groups (`group semis NVDA …` in the command bar) come first and claim
 *  their symbols away from the built-in buckets. */
function RailWidget({ w, all, watchlist, earnDays, quotes }) {
  if (w.type === 'pulse') return <PulsePanel quotes={all} />
  if (w.type === 'markets') return <MarketDeckPanel />
  if (w.type === 'earnings') return <EarningsPanel symbols={watchlist} quotes={quotes} />
  if (w.type === 'calendar') return <MacroCalPanel />
  const title = w.type === 'movers' ? tl('Movers')
    : w.type === 'heat' ? tl('Group heat')
    : w.type === 'alerts' ? tl('Alerts')
    : w.type === 'range' ? tl('At the extremes')
    : w.type === 'risk' ? tl('Risk dials')
    : null
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      {title && (
        <header class="px-3 py-[3px] border-b border-line-2 bg-surface-2">
          <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
        </header>
      )}
      {w.type === 'movers' && <MoversPanel quotes={all} />}
      {w.type === 'heat' && <HeatPanel watchlist={watchlist} quotes={quotes} />}
      {w.type === 'alerts' && <AlertsPanel quotes={quotes} />}
      {w.type === 'range' && <RangePanel quotes={all} />}
      {w.type === 'risk' && <RiskPanel />}
      {w.type === 'chart' && <ChartWidget symbol={w.symbol} />}
    </section>
  )
}

function SectorScroller({ watchlist, quotes }) {
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
    <div class="relative flex-1 min-w-0">
      {/* pr-9 is UNCONDITIONAL: keying it on canRight made the padding change
          the very overflow it measures — at the knife-edge the strip
          oscillated (pad → no overflow → unpad → overflow …), reflowing the
          toolbar on every quote tick. The mag glass danced left-right and the
          row below bounced (Jeff 2026-08-11). The chevron still gates on
          canRight; only the reserved space is constant. */}
      <div ref={scroller}
        class="dashboard-sectors flex items-baseline gap-x-4 min-w-0 font-mono text-[10px] flex-nowrap overflow-x-auto no-scrollbar pr-9">
        {BUCKETS.map((b) => {
          const inList = b.symbols.filter((s) => watchlist.includes(s))
          const avg = bucketAvg(inList)
          if (avg == null) return null
          return (
            <a key={b.name} href="#/markets/sectors" class="whitespace-nowrap hover:no-underline hover:text-ink">
              <span class="text-muted uppercase tracking-wider">{tl(b.name)}</span>{' '}
              {/* fixed slot: a pct crossing a digit-count boundary must not
                  resize the strip and re-trigger the overflow measure */}
              <span class={`inline-block min-w-[2.3rem] ${avg >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(avg)}</span>
            </a>
          )
        })}
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

/** Toolbar hamburger, left of the sector strip: sort and the watchlist picker
 *  fold into one menu instead of standalone controls
 *  (Jeff 2026-08-06: "saves a ton of space"). */
function BoardMenu({ sort, setSort, setViewMode, spark, setSpark, sparkWin, setSparkWin,
                     lists, listId }) {
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
        aria-expanded={open}
        class={`board-control grid h-[26px] w-[26px] place-items-center rounded-lg border ${
          open ? 'border-accent/60 text-accent' : 'text-ink-2 hover:text-accent hover:border-accent/50'}`}>
        <span class={`board-burger ${open ? 'is-open' : ''}`} aria-hidden="true">
          <span class="board-burger-line" />
          <span class="board-burger-line" />
          <span class="board-burger-line" />
        </span>
      </button>
      {open && (
        <div class="board-menu-pop z-40 max-h-[72vh] overflow-y-auto bg-surface-1/95 backdrop-blur border border-line shadow-[0_12px_36px_rgba(0,0,0,0.68)]">
          <span class="board-menu-sheet-handle" aria-hidden="true" />
          <div class="board-menu-grid grid grid-cols-2 gap-1.5 p-1.5">
            <div class="flex min-w-0 flex-col gap-1.5">
              <section class="board-menu-section">
                {head(tl('Watchlist'))}
                {item(tl('Dashboard'), !listId, () => { setOpen(false); location.hash = '#/' })}
                {lists.map((l) => item(l.name, listId === l.id,
                  () => { setOpen(false); location.hash = `#/watchlists/${l.id}` }))}
              </section>
              <section class="board-menu-section">
                {head(tl('Sort'))}
                {SORTS.map(([v, label]) => item(label, sort === v, () => {
                  setOpen(false)
                  setSort(v)
                  // any real sort implies the flat view — grouped rows don't reorder
                  if (v !== 'manual') setViewMode('flat')
                }))}
              </section>
            </div>
            <section class="board-menu-section self-start min-w-0">
              {head(tl('Spark'))}
              <div class="grid grid-cols-2">
                {SPARK_TYPES.map((t) => item(tl(t.label), spark === t.id, () => setSpark(t.id)))}
              </div>
              {/* Shape and horizon are separate controls; keeping this open
                  lets you choose both without reopening the menu twice. */}
              {spark !== 'off' && (
                <>
                  <div class="mx-2.5 mt-1 border-t border-line/70" />
                  {head(tl('Window'))}
                  <div class="grid grid-cols-4 gap-1 px-2.5 pb-2">
                    {SPARK_WINDOWS.map((w) => (
                      <button key={w.id} onClick={() => setSparkWin(w.id)}
                        class={`rounded border px-1 py-1 font-mono text-[9px] ${
                          sparkWin === w.id
                            ? 'border-accent/60 bg-accent-soft text-accent'
                            : 'border-line text-muted hover:text-ink hover:border-line-2'}`}>
                        {w.id}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  )
}

/** The board's search box doubles as a global ticker lookup: type a company
 *  name ("Hynix") and every venue Yahoo knows drops down — the local rows
 *  keep filtering underneath, terminal not required (Jeff 2026-08-06). */
function SearchResultSpark({ symbol }) {
  const [bars, setBars] = useState(null)
  useEffect(() => {
    let dead = false
    setBars(null)
    fetchHistory(symbol, '1D')
      .then((history) => {
        if (dead) return
        setBars(historyBarsToSparkBars(history.bars))
      })
      .catch(() => { if (!dead) setBars([]) })
    return () => { dead = true }
  }, [symbol])
  return (
    <span class="ml-auto w-16 h-3.5 shrink-0" title={`${symbol} intraday`}>
      <Spark type="line" window="1Y" bars={bars} width={64} height={14} class="w-16 h-3.5" />
    </span>
  )
}

// Hoisted ONCE: preact re-sets dash-cased SVG attributes via setAttribute on
// every diff, and a same-value setAttribute still invalidates paint — so an
// inline glass icon repainted on every quote tick and visibly shimmered under
// trackpad/OS zoom while its text siblings held dead still (Jeff 2026-08-11).
// A constant vnode short-circuits the diff entirely.
// The original svg glass, restored once the real shimmer culprit was found
// (board-control dither re-roll, fixed via layer promotion — the svg was
// innocent). Kept as a hoisted const on integral offsets: one vnode, no
// per-render diff, no half-pixel centering (Jeff 2026-08-11: "I want the
// old one").
const GLASS_ICON = (
  <span class="absolute inset-y-0 left-2 text-muted pointer-events-none grid place-items-center">
    <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="4.4" /><path d="m10.4 10.4 3 3" /></svg>
  </span>
)

function TickerSearch({ filter, setFilter, activeList }) {
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
    // shrink-0, not min-w-0: as the row's only shrinkable child this box
    // absorbed every sub-pixel reflow — the glass + placeholder wobbled while
    // fixed neighbors held still (Jeff 2026-08-11). The strip scrolls;
    // nothing here needs to shrink.
    <div ref={boxRef} class="relative shrink-0">
      {/* The 10px glass stays at x=8 inside the 26px folded control, centered
          without changing positioning modes when focus moves to the menu. */}
      {GLASS_ICON}
      <input ref={inputRef} value={filter} onInput={(e) => setFilter(e.currentTarget.value)}
        onFocus={() => { setExpanded(true); if (hits?.length) setOpen(true) }}
        onClick={() => setExpanded(true)}
        onBlur={() => { if (!filter.trim()) setExpanded(false) }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          setOpen(false)
          if (!filter.trim()) { setExpanded(false); e.currentTarget.blur() }
        }}
        placeholder={`${tl('Search')}…`}
        aria-label={tl('Search')}
        class={`board-control board-search min-w-0 border rounded-lg pl-6 py-1 font-anth text-[10px] text-ink outline-none focus:border-accent placeholder:text-[9.5px] placeholder:text-muted/70 transition-[width,background-color,border-color,box-shadow] duration-300 ease-out ${
          expanded ? 'w-44 sm:w-60 pr-2'
            : 'w-[26px] sm:w-[88px] pr-0 sm:pr-2 cursor-pointer max-sm:placeholder:text-transparent'}`} />
      {open && hits?.length > 0 && (
        <div class="absolute top-full left-0 mt-1 w-[26rem] max-w-[88vw] z-40 bg-surface-1/95 backdrop-blur border border-line rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.6)] overflow-hidden">
          {hits.slice(0, 5).map((h) => {
            // two targets, two buttons (Jeff 2026-08-06): [+] drops the hit
            // on whichever board you're LOOKING at, the star is the main
            // watchlist — both toggle, so either action reverses in place
            const inCur = activeList
              ? activeList.symbols.includes(h.symbol)
              : isWatched(h.symbol)
            const toggleCur = () => {
              if (activeList) {
                if (inCur) removeWatchlistSymbol(activeList.id, h.symbol)
                else addWatchlistSymbol(activeList.id, h.symbol)
              } else if (inCur) unwatch(h.symbol)
              else watch(h.symbol)
            }
            const starred = isWatched(h.symbol)
            const toggleStar = () => { if (starred) unwatch(h.symbol); else watch(h.symbol) }
            return (
              <div key={h.symbol}
                class="flex items-baseline gap-2 px-2.5 py-1.5 border-t border-line/60 first:border-0 hover:bg-accent-soft cursor-pointer"
                onClick={() => { setOpen(false); setFilter(''); location.hash = `#/research/${h.symbol.toLowerCase()}` }}>
                {venueFlag(h) && (
                  <img src={venueFlag(h)} alt="" class="w-3 h-[9px] rounded-[1px] shrink-0 self-center"
                    title={h.exch} />
                )}
                <span class="font-mono font-bold text-[10.5px] text-accent shrink-0">{h.symbol}</span>
                <span class="font-anth text-[10.5px] text-ink-2 truncate">{h.name}</span>
                <SearchResultSpark symbol={h.symbol} />
                <span class="font-mono text-[8.5px] uppercase tracking-wider text-muted shrink-0">{h.exch}</span>
                <button
                  title={inCur ? tl('remove from current watchlist') : tl('add to current watchlist')}
                  onClick={(e) => { e.stopPropagation(); toggleCur() }}
                  class={`shrink-0 w-5 h-5 grid place-items-center rounded ${inCur ? 'text-accent' : 'text-muted hover:text-accent'}`}>
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
                    {inCur ? <path d="m3.5 8.5 3 3 6-6.5" /> : <path d="M8 3.5v9M3.5 8h9" />}
                  </svg>
                </button>
                <button
                  title={starred ? tl('remove from board') : tl('add to watchlist')}
                  onClick={(e) => { e.stopPropagation(); toggleStar() }}
                  class={`shrink-0 w-5 h-5 grid place-items-center rounded ${starred ? 'text-accent' : 'text-muted hover:text-accent'}`}>
                  {starred ? '★' : '☆'}
                </button>
              </div>
            )
          })}
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
  // spark shape is a whole-board preference, not per-list: you're picking how
  // to READ a row, and that shouldn't change when you switch watchlists
  const [spark, setSparkState] = useState(() => {
    const saved = localStorage.getItem('dashboard_spark_v1')
    return isSparkType(saved) ? saved : DEFAULT_SPARK
  })
  const [sparkWin, setSparkWinState] = useState(() => {
    const saved = localStorage.getItem('dashboard_spark_window_v1')
    const normalized = normalizeSparkWindow(saved)
    if (saved && saved !== normalized) {
      localStorage.setItem('dashboard_spark_window_v1', normalized)
    }
    return normalized
  })
  const intradaySparks = useIntradaySparks(watchlist, sparkWin === 'DAY' && spark !== 'off')
  // sort is remembered PER LIST — a momentum list can live sorted by %
  // while the main board stays manual (Jeff's fable-run pick #5)
  const sortKey = listId ? `dashboard_sort_v1:${listId}` : 'dashboard_sort_v1'
  const [sort, setSortState] = useState(() => localStorage.getItem(sortKey) || 'manual')
  useEffect(() => { setSortState(localStorage.getItem(sortKey) || 'manual') }, [sortKey])
  const [filter, setFilter] = useState('')
  const setViewMode = (mode) => {
    setViewModeState(mode)
    localStorage.setItem('dashboard_view_mode_v1', mode)
  }
  const setSpark = (type) => {
    if (!isSparkType(type)) return
    setSparkState(type)
    localStorage.setItem('dashboard_spark_v1', type)
  }
  const setSparkWin = (id) => {
    if (!isSparkWindow(id)) return
    setSparkWinState(id)
    localStorage.setItem('dashboard_spark_window_v1', id)
  }
  const setSort = (value) => {
    setSortState(value)
    localStorage.setItem(sortKey, value)
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
  const [revealedSym, setRevealedSym] = useState(null)
  const toggleReveal = (sym) => setRevealedSym((cur) => (cur === sym ? null : sym))
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
      {/* ONE row at every width (Jeff 2026-08-06: "do not use a second row
          in any view") — the strip scrolls, everything else shrinks */}
      <div class="dashboard-toolbar flex items-center gap-2 md:gap-4 px-1 pb-2 min-w-0">
        <div class="dashboard-controls flex items-center gap-2 min-w-0 shrink-0">
          <BoardMenu sort={sort} setSort={setSort} setViewMode={setViewMode}
            spark={spark} setSpark={setSpark} sparkWin={sparkWin} setSparkWin={setSparkWin}
            lists={namedWatchlists} listId={activeList?.id || null} />
          {activeList && (
            <div class="min-w-0 mr-1">
              <div class="font-mono text-[8px] uppercase tracking-wider text-muted">{tl('Watchlist')}</div>
              <div class="font-anth font-bold text-[13px] text-ink truncate">{activeList.name}</div>
            </div>
          )}
          <div class={`${activeList ? 'ml-auto' : ''} board-control inline-flex rounded-lg border p-0.5 shrink-0`}>
            <button onClick={() => setViewMode('grouped')}
              class={`px-2 py-0.5 rounded-md font-anth text-[10px] transition-colors ${viewMode === 'grouped' ? 'bg-accent-soft text-accent shadow-sm' : 'text-muted hover:text-ink'}`}>
              {tl('Sectors')}
            </button>
            <button onClick={() => setViewMode('flat')}
              class={`px-2 py-0.5 rounded-md font-anth text-[10px] transition-colors ${viewMode === 'flat' ? 'bg-accent-soft text-accent shadow-sm' : 'text-muted hover:text-ink'}`}>
              {tl('All')}
            </button>
          </div>
          <TickerSearch filter={filter} setFilter={setFilter} activeList={activeList} />
          <button data-select-trigger type="button" aria-pressed={selecting}
            title={tl('Select rows')}
            onClick={() => { if (selecting) endSelect(); else setSelecting(true) }}
            class={`board-control h-[25px] shrink-0 inline-flex items-center gap-1 rounded-lg border px-2 font-anth text-[10px] transition-colors ${
              selecting
                ? 'border-accent/60 bg-accent-soft text-accent'
                : 'border-white/25 text-ink-2 hover:text-accent hover:border-accent/50'
            }`}>
            {/* checkbox glyph: without it the button read as the search
                field's submit (Jeff 2026-08-11); 25px matches the search +
                view-toggle beside it, not the 26px burger across the row */}
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="1.5" y="1.5" width="11" height="11" rx="2.5" />
              <path d="m4.4 7.2 1.9 1.9 3.4-4" />
            </svg>
            {tl('Select')}
          </button>
        </div>

        {/* Align the batch tray with the board, not the widget rail, so the
            controls visually belong to the rows they operate on. */}
        {selecting ? (
          <div data-select-actions class="ml-auto lg:mr-[238px] flex items-center gap-1.5 font-mono text-[10px] whitespace-nowrap overflow-x-auto no-scrollbar">
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
          <div class="flex items-center gap-2 min-w-0 flex-1 ml-auto">
            {/* Thesis strip: bucket averages at a glance. One swipeable line at
                every width — it wrapped to four lines of prime real estate
                (Jeff 2026-08-04: "keep it all on one line somehow"). */}
            <SectorScroller watchlist={watchlist} quotes={quotes} />
          </div>
        )}
      </div>

      {/* lg (1024px) not xl: the rail used to vanish one browser-zoom notch in.
          1024 keeps it alive through two more notches (115%, 125%) on a 1376px
          CSS viewport before genuinely running out of room. */}
      <div class="grid gap-2 lg:grid-cols-[1fr_230px] min-w-0">
        <section data-watchlist-board class="@container bg-surface-1 border border-line rounded-xl overflow-hidden min-w-0">
          {reordering ? (
            <ReorderList watchlist={watchlist} quotes={quotes}
              onMove={nudgeSymbol} onPlace={dropSymbol} onRemove={removeSymbol}
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
                    onRemove={removeSymbol} selecting={selecting} spark={spark} sparkWin={sparkWin}
                    intradayBars={intradaySparks[s]}
                    revealed={revealedSym === s} onReveal={toggleReveal}
                    selected={selected.has(s)} onToggleSelect={toggleSelect} />
                ))}
              </div>
            )
          }) : flatRows.map(({ symbol }) => (
            <TuiRow key={symbol} symbol={symbol} data={quotes[symbol]} earnDays={earnDays[symbol]}
              onRemove={removeSymbol} selecting={selecting} spark={spark} sparkWin={sparkWin}
              intradayBars={intradaySparks[symbol]}
              revealed={revealedSym === symbol} onReveal={toggleReveal}
              selected={selected.has(symbol)} onToggleSelect={toggleSelect} />
          ))}
          {!watchlist.length && (
            <Empty label={tl('empty watchlist — add the first ticker below')} />
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
