import { useEffect, useMemo, useState } from 'preact/hooks'
import { fetchHistory } from '../lib/history.js'
import { startVisibleClock } from '../lib/idleClock.js'
import {
  eventAlertPlan, eventClock, eventKind, eventLinkedSymbols, eventNarrative,
  eventNumbers, eventPhase, eventReaction, eventSurprise, formatCountdown,
} from '../lib/eventLinks.js'
import { addAlert, getAlertDeliveryPrefs } from '../lib/alerts.js'
import { fetchAlertDestinations } from '../lib/alertDelivery.js'
import { evHeadline, fetchSymbolWire, peekSymbolWire, wireServiceUrl } from '../lib/wire.js'
import { getLocale } from '../lib/i18n.js'
import { BUCKETS } from '../lib/symbols.js'
import { useEscape, useQuotes, useWatchlist } from '../hooks.js'
import { AiReport } from '../components/AiReport.jsx'
import { BRIEFING_SYSTEM } from '../lib/briefing.js'
import { EARNINGS_UNIVERSE,
  MARKET_GROUPS, SECTORS, COMMODITY_GROUPS, ECON_EVENTS, RELATIVE_SIGNALS, eventDayLabel,
  upcomingEvents, calendarEventDetails,
} from '../lib/markets.js'
import {
  addCatalyst, loadCatalysts, onCatalystsChange, removeCatalyst, mergedEvents,
  CATALYST_TYPES,
} from '../lib/catalysts.js'
import { pulseStats } from '../lib/pulse.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { tl } from '../lib/i18n.js'
import { EarningsDay } from '../components/EarningsDay.jsx'
import { fmtPrice, fmtPct, fmtChange, fmtVol, fmtFracPct } from '../lib/format.js'
import { Histo } from '../components/Histo.jsx'
import { FlashMetric, FlashPrice } from '../components/Fig.jsx'
import { hrefFor } from '../lib/route.js'
import { sessionMeter } from '../lib/format.js'
import { extendedLabelClass } from '../lib/extendedHours.js'
import { Spark } from '../components/Spark.jsx'
import {
  MARKET_VISUALS, MARKET_VISUAL_WINDOWS, loadMarketVisualPrefs, saveMarketVisualPrefs,
} from '../lib/marketVisuals.js'

/** The day's session on one labeled track: the grey rail is today's range, the
 *  coloured span is the distance travelled from yesterday's close to the last
 *  trade, the hairline is that close and the bright tick is price now.
 *
 *  The old version drew only the position marker, which sat mid-track on
 *  virtually every index and told you nothing (Jeff 2026-08-06, task #48).
 *  Direction now reads as colour, conviction as span length, and where the
 *  tape closed the day out as marker position. */
function DayMeter({ q }) {
  const m = sessionMeter(q?.dayLow, q?.dayHigh, q?.price, q?.prevClose)
  if (m == null) return null
  const pct = (v) => fmtFracPct(v, 1)
  const tone = m.up ? 'bg-up' : 'bg-down'
  const title = `${fmtPrice(q.dayLow)} – ${fmtPrice(q.dayHigh)}`
    + (q.prevClose != null ? ` · ${tl('prev close')} ${fmtPrice(q.prevClose)}` : '')
    + (m.gap ? ` · ${tl('gap')}` : '')
  return (
    <span class="grid grid-cols-[12px_minmax(0,1fr)_12px] items-center gap-1 w-[92px] h-[14px]"
          role="img" aria-label={title} title={title}>
      <span class="font-mono text-[7px] leading-none text-muted">{tl('Lo')}</span>
      <span class="relative block h-[11px]">
        <span class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[4px] bg-line-2 rounded-full" />
        {/* travelled span — zero-width on a flat tape, so a dead row looks dead */}
        <span class={`absolute top-1/2 -translate-y-1/2 h-[4px] rounded-full ${tone} opacity-80`}
              style={{ left: pct(m.from), width: pct(Math.max(0, m.to - m.from)) }} />
        {m.prevPos != null && (
          <span class="absolute top-1/2 -translate-y-1/2 w-[2px] h-[9px] bg-ink-2/75"
                style={{ left: `calc(${pct(m.prevPos)} - 1px)` }} />
        )}
        <span class={`absolute top-1/2 -translate-y-1/2 w-[5px] h-[11px] rounded-sm ${tone}`}
              style={{ left: `calc(${pct(m.pos)} - 2.5px)` }} />
      </span>
      <span class="font-mono text-[7px] leading-none text-muted text-right">{tl('Hi')}</span>
    </span>
  )
}

function MarketVisual({ visual, window, data }) {
  if (visual === 'session') return <DayMeter q={data?.quote} />
  if (visual === 'off') return null
  return (
    <Spark type={visual} window={window} bars={data?.histo}
      width={88} height={20} class="w-[88px] h-5" />
  )
}

/** A yield spread computed from two rows above it — inverted curves are the
 *  point, so the sign gets the colour rather than the day's direction. */
function SpreadRow({ label, hint, spread, quotes, withUnits = false, visual = null }) {
  const [a, b] = spread
  const qa = quotes[a]?.quote?.price
  const qb = quotes[b]?.quote?.price
  const val = qa != null && qb != null ? qa - qb : null
  return (
    <tr class="border-b border-line last:border-0 bg-white/[0.02]">
      <td class="px-3 py-[3px] text-[12px] text-ink-2 whitespace-nowrap font-anth">
        {label} <span class="text-muted text-[10px]">{hint}</span>
      </td>
      <td class={`px-2 py-[3px] font-mono font-semibold text-[12px] text-right w-24 ${
        val == null ? 'text-muted' : val >= 0 ? 'text-up' : 'text-down'}`}>
        {val == null ? '—' : `${val >= 0 ? '+' : ''}${val.toFixed(2)}`}
      </td>
      <td class="px-2 py-[3px] text-right font-mono text-[10px] text-muted w-20">
        {val == null ? '' : `${Math.round(val * 100)}bp`}
      </td>
      {/* Pad to the table's FULL column count. A row that stops short leaves
          the tail columns with no cell at all, and a cell is what carries the
          row's bottom border — so the separator line just stopped partway
          across, which reads as a phantom column starting at the sparkline
          (Jeff 2026-08-07). */}
      <td colSpan={visual == null
        ? (withUnits ? 4 : 3)
        : withUnits ? (visual === 'off' ? 2 : 3) : (visual === 'off' ? 1 : 2)} />
    </tr>
  )
}

function QuoteRow({ label, symbol, data, unit, withUnits = false,
                    visual = null, visualWindow = null }) {
  const q = data?.quote
  const up = (q?.pct ?? 0) >= 0
  const tone = q ? (up ? 'text-up' : 'text-down') : 'text-muted'
  return (
    <tr
      class="border-b border-line last:border-0 hover:bg-white/[0.035] cursor-pointer"
      onClick={() => { if (symbol) location.hash = hrefFor('research', symbol.toLowerCase()) }}
    >
      <td class="px-3 py-[3px] text-[12px] text-ink whitespace-nowrap max-sm:whitespace-normal font-anth">{label}</td>
      {/* Keyed off the TABLE's mode, not this row's value. Gating on
          `unit !== undefined` meant a units table whose items did not all
          carry a unit emitted 7 cells on some rows and 6 on others. */}
      {withUnits && <td class="px-2 py-[3px] font-tick text-[10px] text-muted">{unit ?? ''}</td>}
      <td class="px-2 py-[3px] font-mono font-semibold text-[12px] text-ink text-right w-24">
        {q ? <FlashPrice price={q.price} fmt={fmtPrice} /> : '—'}
      </td>
      <td class={`px-2 py-[3px] font-mono text-[11px] text-right w-20 ${tone}`}>
        {q ? <FlashMetric value={q.change} fmt={fmtChange} /> : ''}
      </td>
      <td class={`px-2 py-[3px] font-mono text-[11px] text-right w-16 ${tone}`}>
        {q ? fmtPct(q.pct) : ''}
      </td>
      {visual == null ? (
        <>
          <td class="pl-1 pr-2 py-[3px] hidden @[380px]:table-cell w-[104px] min-w-[104px]"><DayMeter q={q} /></td>
          <td class="px-2 py-[3px] hidden @[460px]:table-cell">
            <Histo bars={data?.histo} width={84} class="w-[84px] @max-[560px]:w-[52px]" />
          </td>
        </>
      ) : visual !== 'off' ? (
        <td class="pl-1 pr-2 py-[3px] hidden @[380px]:table-cell w-[104px] min-w-[104px]">
          <MarketVisual visual={visual} window={visualWindow} data={data} />
        </td>
      ) : null}
    </tr>
  )
}

const groupId = (name) => `market-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

function GroupCard({ name, items, quotes, withUnits, visual = null, visualWindow = null }) {
  const pcts = items.filter((i) => !i.spread)
    .map((i) => quotes[i.symbol]?.quote?.pct).filter((v) => v != null)
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
  const green = pcts.filter((v) => v >= 0).length
  return (
    <section id={groupId(name)} class="bg-surface-1 border border-line rounded-xl overflow-hidden @container scroll-mt-3">
      <header class="flex items-baseline gap-2 px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl(name)}</h2>
        {avg != null && (
          <>
            <span class={`font-mono text-[11px] font-semibold ${avg >= 0 ? 'text-up' : 'text-down'}`}>
              {fmtPct(avg)}
            </span>
            <span class="ml-auto font-mono text-[9.5px] text-muted" title={tl('advancing / total')}>
              {green}/{pcts.length}
            </span>
          </>
        )}
      </header>
      <table class="w-full border-collapse">
        <tbody>
          {items.map((it) => (it.spread ? (
            <SpreadRow key={it.label} label={tl(it.label)} hint={tl(it.hint)}
                       spread={it.spread} quotes={quotes} withUnits={withUnits} visual={visual} />
          ) : (
            <QuoteRow
              key={it.symbol}
              symbol={it.symbol}
              label={tl(it.label)}
              unit={it.unit}
              withUnits={withUnits}
              data={quotes[it.symbol]}
              visual={visual}
              visualWindow={visualWindow}
            />
          )))}
        </tbody>
      </table>
    </section>
  )
}

function MarketVisualPicker({ visual, window, onVisual, onWindow }) {
  const field = 'appearance-none rounded-full border border-line bg-surface-1 py-1 max-sm:py-0.5 pl-2.5 max-sm:pl-2 pr-6 font-anth text-[10px] max-sm:text-[9px] text-ink-2 outline-none hover:border-accent/50 focus:border-accent/70'
  return (
    <div class="flex shrink-0 items-center gap-1">
      <span class="font-anth text-[9px] uppercase tracking-wider text-muted">{tl('Visual')}</span>
      <span class="relative">
        <select value={visual} onChange={(e) => onVisual(e.currentTarget.value)}
          aria-label={tl('Row visual')} class={field}>
          {MARKET_VISUALS.map((item) => (
            <option key={item.id} value={item.id}>{tl(item.label)}</option>
          ))}
        </select>
        <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[8px] text-muted">▾</span>
      </span>
      {visual !== 'session' && visual !== 'off' && (
        <span class="relative">
          <select value={window} onChange={(e) => onWindow(e.currentTarget.value)}
            aria-label={tl('Window')} class={`${field} font-mono pl-2 pr-5`}>
            {MARKET_VISUAL_WINDOWS.map((item) => (
              <option key={item.id} value={item.id}>{item.id}</option>
            ))}
          </select>
          <span class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-muted">▾</span>
        </span>
      )}
    </div>
  )
}

function MarketJumpBar({ visual, window, onVisual, onWindow }) {
  return (
    <nav class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2" aria-label={tl('Market groups')}>
      <MarketVisualPicker visual={visual} window={window} onVisual={onVisual} onWindow={onWindow} />
      <span class="h-4 w-px bg-line shrink-0 mx-1" aria-hidden="true" />
      <span class="font-anth text-[9px] uppercase tracking-wider text-muted shrink-0 mr-1">{tl('Jump to')}</span>
      {MARKET_GROUPS.map((group) => (
        <button key={group.name} type="button"
          onClick={() => document.getElementById(groupId(group.name))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          class="shrink-0 rounded-full border border-line px-2.5 py-1 max-sm:px-2 max-sm:py-0.5 font-anth text-[10px] max-sm:text-[9px] text-ink-2 hover:text-accent hover:border-accent/50 hover:no-underline">
          {tl(group.name)}
        </button>
      ))}
    </nav>
  )
}

function RelativeSignals() {
  const symbols = [...new Set(RELATIVE_SIGNALS.flatMap((item) => [item.a, item.b]))]
  const quotes = useQuotes(symbols)
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden @container">
      <header class="flex items-baseline gap-2 px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Relative signals')}</h2>
        <span class="ml-auto font-anth text-[9px] text-muted">{tl('leadership and risk appetite')}</span>
      </header>
      <table class="w-full border-collapse">
        <tbody>
          {RELATIVE_SIGNALS.map((item) => {
            const a = quotes[item.a]?.quote
            const b = quotes[item.b]?.quote
            const ratio = a?.price != null && b?.price ? a.price / b.price : null
            const relative = a?.pct != null && b?.pct != null ? a.pct - b.pct : null
            return (
              <tr key={item.label} class="border-b border-line last:border-0 hover:bg-white/[0.035] cursor-pointer"
                onClick={() => { location.hash = hrefFor('research', item.a.toLowerCase()) }}>
                <td class="px-3 py-[3px] font-anth text-[11.5px] text-ink-2">{tl(item.label)}</td>
                <td class="px-2 py-[3px] text-right font-mono text-[10px] text-muted">{item.a}/{item.b}</td>
                <td class="px-2 py-[3px] text-right font-mono text-[11.5px] text-ink font-semibold">{ratio == null ? '—' : ratio.toFixed(ratio >= 100 ? 1 : ratio >= 10 ? 2 : 3)}</td>
                <td class={`px-3 py-[3px] text-right font-mono text-[11px] ${relative == null ? 'text-muted' : relative >= 0 ? 'text-up' : 'text-down'}`}>
                  {relative == null ? '—' : fmtPct(relative)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Overview() {
  const symbols = MARKET_GROUPS.flatMap((g) => g.items.map((i) => i.symbol)).filter(Boolean)
  const quotes = useQuotes(symbols)
  const [visualPrefs, setVisualPrefs] = useState(loadMarketVisualPrefs)
  const chooseVisual = (patch) => {
    setVisualPrefs((current) => {
      const next = { ...current, ...patch }
      saveMarketVisualPrefs(globalThis.localStorage, next)
      return next
    })
  }
  return (
    <div>
      <MarketJumpBar visual={visualPrefs.visual} window={visualPrefs.window}
        onVisual={(visual) => chooseVisual({ visual })}
        onWindow={(window) => chooseVisual({ window })} />
      {/* CSS columns, not a grid: a grid row is as tall as its tallest card,
          so a 2-row Canada beside a 10-row Asia-Pacific left a slab of black
          under it. Columns pack each card against the one above (Jeff
          2026-08-06: "no need to align the boxes like that"). */}
      <div class="md:columns-2 xl:columns-3 min-[1800px]:columns-4 gap-2 [&>*]:mb-2 md:[&>*]:break-inside-avoid">
        {MARKET_GROUPS.map((g) => (
          <GroupCard key={g.name} name={g.name} items={g.items} quotes={quotes}
            visual={visualPrefs.visual} visualWindow={visualPrefs.window} />
        ))}
        <RelativeSignals />
      </div>
    </div>
  )
}

/** Trailing sector returns off cached 3M dailies — the rotation read. */
function SectorRotation() {
  const [hist, setHist] = useState({})
  useEffect(() => {
    let dead = false
    // One request every 150ms so eleven sector histories do not go out as a
    // single burst. The handles are kept: leaving the tab drops the queue
    // instead of walking it out over the next second and a half against a
    // component that no longer exists.
    const queued = SECTORS.map(({ symbol }, i) => setTimeout(() => {
      if (dead) return
      fetchHistory(symbol, '3M')
        .then((h) => !dead && setHist((cur) => ({ ...cur, [symbol]: h?.bars || [] })))
        .catch(() => {})
    }, i * 150))
    return () => {
      dead = true
      queued.forEach(clearTimeout)
    }
  }, [])
  const ret = (bars, days) => {
    if (!bars?.length) return null
    const last = bars[bars.length - 1]?.close
    const cutoff = Date.now() / 1000 - days * 86400
    const base = bars.find((b) => b.time >= cutoff)?.close
    return base && last ? ((last / base) - 1) * 100 : null
  }
  const rows = SECTORS.map((sec) => ({
    ...sec, w1: ret(hist[sec.symbol], 7), m1: ret(hist[sec.symbol], 30), m3: ret(hist[sec.symbol], 91),
  })).sort((a, b) => (b.m1 ?? -99) - (a.m1 ?? -99))
  const cell = (v) => (
    <td class={`px-2 py-[3px] text-right font-mono text-[11px] ${v == null ? 'text-muted' : v >= 0 ? 'text-up' : 'text-down'}`}>
      {v == null ? '—' : fmtPct(v)}
    </td>
  )
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl('Rotation — trailing')}</h2>
      </header>
      <table class="w-full border-collapse">
        <thead>
          <tr class="text-[8.5px] font-mono text-muted uppercase tracking-wider">
            <th class="px-3 py-1 text-left">{tl('sector')}</th>
            <th class="px-2 py-1 text-right">1w</th>
            <th class="px-2 py-1 text-right">1m</th>
            <th class="px-2 py-1 text-right">3m</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol} class="border-t border-line hover:bg-surface-3 cursor-pointer"
              onClick={() => (location.hash = `#/research/${r.symbol.toLowerCase()}`)}>
              <td class="px-3 py-[3px] font-mono text-[11px]">
                <span class="font-[650] font-tick text-ink">{r.symbol}</span>{' '}
                <span class="text-muted font-anth text-[10.5px] max-sm:hidden">{tl(r.label)}</span>
              </td>
              {cell(r.w1)}{cell(r.m1)}{cell(r.m3)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Sectors() {
  const quotes = useQuotes(SECTORS.map((s) => s.symbol))
  const rows = SECTORS.map((s) => ({ ...s, q: quotes[s.symbol]?.quote }))
    .sort((a, b) => (b.q?.pct ?? -99) - (a.q?.pct ?? -99))
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.q?.pct ?? 0)))

  return (
    <div class="xl:columns-2 gap-2 [&>*]:mb-2 xl:[&>*]:break-inside-avoid">
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Sector ETFs — today')}
        </h2>
      </header>
      <div class="p-2">
        {rows.map(({ symbol, label, q }) => {
          const pct = q?.pct ?? 0
          const up = pct >= 0
          const w = (Math.abs(pct) / maxAbs) * 100
          return (
            <a key={symbol} href={`#/research/${symbol.toLowerCase()}`}
              class="flex items-center gap-2 px-1 py-[3px] font-mono text-[11px] hover:bg-white/[0.03] hover:no-underline rounded">
              <span class="w-9 font-[650] font-tick text-ink">{symbol}</span>
              <span class="w-36 text-muted truncate max-sm:hidden font-anth">{tl(label)}</span>
              <span class="w-16 text-right text-ink-2 max-sm:hidden">{q ? fmtPrice(q.price) : ''}</span>
              <span class={`w-14 text-right text-[10px] max-md:hidden ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
                {q ? fmtChange(q.change) : ''}
              </span>
              <div class="flex-1 h-3.5 relative">
                <div
                  class={`absolute inset-y-0 left-0 rounded-sm ${up ? 'bg-up/30' : 'bg-down/30'}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span class={`w-16 text-right font-semibold ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
                {q ? fmtPct(pct) : '—'}
              </span>
            </a>
          )
        })}
      </div>
    </section>
    <SectorRotation />
    </div>
  )
}

function Commodities() {
  const symbols = COMMODITY_GROUPS.flatMap((g) => g.items.map((i) => i.symbol))
  const quotes = useQuotes(symbols)
  return (
    <div class="lg:columns-2 2xl:columns-3 gap-2 [&>*]:mb-2 lg:[&>*]:break-inside-avoid">
      {COMMODITY_GROUPS.map((g) => (
        <GroupCard key={g.name} name={g.name} items={g.items} quotes={quotes} withUnits />
      ))}
    </div>
  )
}

function heatStyle(pct) {
  if (pct == null) return { background: 'var(--color-surface-2)' }
  const a = Math.min(Math.abs(pct) / 5, 1) * 0.55 + 0.08
  return {
    background: pct >= 0 ? `rgba(63, 185, 80, ${a})` : `rgba(248, 81, 73, ${a})`,
  }
}

function Heatmap() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  // bucketed, so the map reads by theme instead of one undifferentiated wall
  const grouped = []
  const seen = new Set()
  for (const b of BUCKETS) {
    const syms = watchlist.filter((s2) => b.symbols.includes(s2))
    if (syms.length) { grouped.push({ name: b.name, syms }); syms.forEach((x) => seen.add(x)) }
  }
  const rest = watchlist.filter((s2) => !seen.has(s2))
  if (rest.length) grouped.push({ name: 'Other', syms: rest })
  return (
    <div class="flex flex-col gap-3">
      {grouped.map(({ name, syms }) => {
        const tiles = syms.map((s2) => ({ symbol: s2, q: quotes[s2]?.quote }))
          .sort((a, b) => (b.q?.pct ?? -99) - (a.q?.pct ?? -99))
        const pcts = tiles.map((t) => t.q?.pct).filter((v) => v != null)
        const avg2 = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
        return (
          <div key={name}>
            <div class="flex items-baseline gap-2 pb-1 px-0.5">
              <span class="font-mono text-[10px] uppercase tracking-[.12em] text-muted">{tl(name)}</span>
              {avg2 != null && <span class={`font-mono text-[10px] ${avg2 >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(avg2)}</span>}
            </div>
            <HeatTiles tiles={tiles} />
          </div>
        )
      })}
    </div>
  )
}

function HeatTiles({ tiles }) {
  return (
    <div class="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
      {tiles.map(({ symbol, q }) => (
        <a
          key={symbol}
          href={`#/research/${symbol.toLowerCase()}`}
          class="rounded-lg border border-line p-2 hover:border-line-2 hover:no-underline"
          style={heatStyle(q?.pct)}
        >
          <div class="flex items-baseline justify-between">
            <span class="font-tick font-[650] text-[12px] text-ink">{symbol}</span>
            <span class="font-mono text-[11px] font-semibold text-ink">{q ? fmtPct(q.pct) : '—'}</span>
          </div>
          <div class="flex items-baseline justify-between font-mono text-[10px] text-ink-2">
            <span>{q ? fmtPrice(q.price) : ''}</span>
            <span>{q?.volume != null ? fmtVol(q.volume) : ''}</span>
          </div>
          {q?.extLabel && q.extPct != null && (
            <div class="font-mono text-[9.5px] text-ink-2">
              <span class={extendedLabelClass(q.extLabel)}>{q.extLabel}</span> {fmtPct(q.extPct)}
            </div>
          )}
        </a>
      ))}
    </div>
  )
}

function MoverTable({ title, rows }) {
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
      </header>
      <table class="w-full border-collapse font-mono text-[11px]">
        <thead>
          <tr class="text-[8.5px] text-muted uppercase tracking-wider">
            <th class="px-3 py-1 text-left">{tl('sym')}</th>
            <th class="px-2 py-1 text-right">{tl('px')}</th>
            <th class="px-2 py-1 text-right">{tl('chg')}</th>
            <th class="px-2 py-1 text-right">%</th>
            <th class="px-2 py-1 text-right max-xl:hidden">{tl('vol')}</th>
            <th class="px-2 py-1 text-right max-2xl:hidden">{tl('ext')}</th>
            <th class="px-2 py-1 max-xl:hidden">{tl('day')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ symbol, q }) => {
            const up = (q?.pct ?? 0) >= 0
            const extUp = (q?.extPct ?? 0) >= 0
            return (
              <tr key={symbol} class="border-t border-line hover:bg-surface-3 cursor-pointer"
                onClick={() => (location.hash = `#/research/${symbol.toLowerCase()}`)}>
                <td class="px-3 py-[3px] font-[650] font-tick text-ink">{symbol}</td>
                <td class="px-2 py-[3px] text-right text-ink font-semibold">{fmtPrice(q?.price)}</td>
                <td class={`px-2 py-[3px] text-right text-[10.5px] ${up ? 'text-up' : 'text-down'}`}>{fmtChange(q?.change)}</td>
                <td class={`px-2 py-[3px] text-right font-semibold ${up ? 'text-up' : 'text-down'}`}>{fmtPct(q?.pct)}</td>
                <td class="px-2 py-[3px] text-right text-muted text-[10.5px] max-xl:hidden">{q?.volume != null ? fmtVol(q.volume) : ''}</td>
                <td class={`px-2 py-[3px] text-right text-[10.5px] max-2xl:hidden ${q?.extPct != null ? (extUp ? 'text-up' : 'text-down') : 'text-muted'}`}>
                  {q?.extPct != null ? fmtPct(q.extPct) : ''}
                </td>
                <td class="px-2 py-[3px] max-xl:hidden"><DayMeter q={q} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function Movers() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  const priced = watchlist
    .map((s) => ({ symbol: s, q: quotes[s]?.quote }))
    .filter((r) => r.q?.pct != null)
  const byPct = [...priced].sort((a, b) => b.q.pct - a.q.pct)
  const byVol = [...priced].sort((a, b) => (b.q.volume ?? 0) - (a.q.volume ?? 0))
  // same breadth maths as the rail's Pulse block — one definition of
  // advancing/±2%/stress so the two panels can't disagree
  const stats = pulseStats(priced.map((r) => ({ symbol: r.symbol, pct: r.q.pct })))

  const buildMoversPrompt = async () => {
    const line = (r) => `${r.symbol} ${r.q.price?.toFixed(2)} ${r.q.pct > 0 ? '+' : ''}${r.q.pct.toFixed(2)}%`
    return {
      system: BRIEFING_SYSTEM,
      prompt: 'Today\'s watchlist tape.\nGainers: '
        + byPct.slice(0, 8).map(line).join(', ')
        + '\nLosers: ' + byPct.slice(-8).reverse().map(line).join(', ')
        + '\n\nWrite a tight market read: what theme is driving the dispersion,'
        + ' which moves look like signal vs noise, one risk. Under 150 words.',
    }
  }
  return (
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-2 font-mono text-[11px]">
        {[
          ['breadth', <span><span class="text-up">{stats?.adv ?? 0}</span><span class="text-muted">/</span><span class="text-down">{stats?.dec ?? 0}</span></span>],
          ['avg move', <span class={stats && stats.avg >= 0 ? 'text-up' : 'text-down'}>{stats ? fmtPct(stats.avg) : '—'}</span>],
          ['±2% movers', <span class="text-ink">{stats?.movers ?? 0}<span class="text-muted">/{priced.length}</span></span>],
          ['down >3%', <span class={stats?.stress ? 'text-down font-bold' : 'text-ink-2'}>{stats?.stress ?? 0}</span>],
        ].map(([label, val]) => (
          <span key={label} class="bg-surface-1 border border-line rounded-lg px-2.5 py-1 flex items-baseline gap-1.5">
            <span class="text-[9px] uppercase tracking-wider text-muted">{tl(label)}</span>{val}
          </span>
        ))}
      </div>
      <AiReport
        label="AI market read"
        filename="market-read.md"
        buildPrompt={buildMoversPrompt}
        archive={{ kind: 'market-read', title: 'market read' }}
      />
      <div class="grid gap-2 lg:grid-cols-3">
        <MoverTable title={tl('Gainers')} rows={byPct.filter((r) => r.q.pct > 0).slice(0, 14)} />
        <MoverTable title={tl('Losers')} rows={byPct.filter((r) => r.q.pct < 0).slice(-14).reverse()} />
        <MoverTable title={tl('Most active')} rows={byVol.slice(0, 14)} />
      </div>
    </div>
  )
}

// Earnings day mode replaces the old flat "upcoming" table: the docket picks
// a name, the panel is the event itself (implied vs realized move, reaction
// history, the wire on that name).
function EarningsTab() {
  const watchlist = useWatchlist()
  // ETFs have no earnings — skip the obvious ones to save requests. The page
  // covers the same expanded universe as the rail widget: watchlist plus the
  // megacaps whose prints move the whole tape (Jeff 2026-08-06).
  const named = [...new Set([...watchlist, ...EARNINGS_UNIVERSE])]
    .filter((s) => !['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'].includes(s))
  return <EarningsDay symbols={named} />
}

function Earnings() {
  const watchlist = useWatchlist()
  const [rows, setRows] = useState({})

  useEffect(() => {
    let alive = true
    // ETFs have no earnings — skip the obvious ones to save requests.
    const named = watchlist.filter((s) => !['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'].includes(s))
    for (const sym of named) {
      fetchEarningsDate(sym)
        .then((v) => alive && setRows((r) => ({ ...r, [sym]: v })))
        .catch(() => alive && setRows((r) => ({ ...r, [sym]: null })))
    }
    return () => { alive = false }
  }, [watchlist.join(',')])

  const now = Date.now()
  const upcoming = Object.entries(rows)
    .filter(([, v]) => v?.date && v.date >= now - 86_400_000)
    .map(([sym, v]) => ({ sym, ...v, days: Math.round((v.date - now) / 86_400_000) }))
    .sort((a, b) => a.date - b.date)

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden max-w-xl">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Upcoming earnings — watchlist')}
        </h2>
      </header>
      {upcoming.length === 0 && (
        <div class="px-3 py-3 font-mono text-[11px] text-muted">{tl('loading earnings dates…')}</div>
      )}
      <table class="w-full border-collapse font-mono text-[12px]">
        <tbody>
          {upcoming.map((e) => {
            const cls = e.days <= 0 ? 'text-imminent font-bold'
              : e.days <= 7 ? 'text-down' : e.days <= 21 ? 'text-accent' : 'text-ink-2'
            return (
              <tr
                key={e.sym}
                class="border-b border-line last:border-0 hover:bg-surface-3 cursor-pointer"
                onClick={() => (location.hash = `#/research/${e.sym.toLowerCase()}`)}
              >
                <td class="px-3 py-[3px] font-bold text-accent">{e.sym}</td>
                <td class="px-2 py-[3px] text-ink">
                  {new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td class="px-2 py-[3px] text-ink-2 text-right">
                  {e.epsEstimate != null ? `est ${e.epsEstimate.toFixed(2)}` : ''}
                </td>
                <td class={`px-3 py-[3px] text-right ${cls}`}>
                  {e.days <= 0 ? tl('today') : `${e.days}d`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

const URGENCY = [
  { max: 3, cls: 'text-down' },
  { max: 10, cls: 'text-accent' },
  { max: Infinity, cls: 'text-ink-2' },
]

const CAT_FIELD = 'bg-surface-2 border border-line rounded-md px-1.5 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent'

/** Calendar footer: the CLI's `cat add` as one collapsed row. Same
 *  addCatalyst() plumbing the command bar uses, so entries made either way are
 *  the same records — the footer used to only *tell* you the CLI syntax. */
function CatalystAdd({ today }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(today)
  const [symbol, setSymbol] = useState('')
  const [type, setType] = useState('product')
  const [label, setLabel] = useState('')
  const [error, setError] = useState(null)

  if (!open) {
    return (
      <footer class="px-3 py-1.5 border-t border-line font-mono text-[10px] text-muted">
        <button onClick={() => setOpen(true)} class="text-accent hover:underline">
          + {tl('add your own')}
        </button>
      </footer>
    )
  }

  const submit = (e) => {
    e.preventDefault()
    setError(null)
    try {
      addCatalyst({ date, symbol, type, label })
      setLabel('')
      setSymbol('')
      setOpen(false)
    } catch (err) {
      setError(tl(String(err?.message || err)))
    }
  }

  return (
    <footer class="px-3 py-1.5 border-t border-line">
      <form onSubmit={submit} class="flex flex-wrap items-center gap-1.5">
        <input type="date" class={CAT_FIELD} value={date} aria-label={tl('Date')}
          onInput={(e) => setDate(e.currentTarget.value)} />
        <input class={`${CAT_FIELD} w-20 uppercase`} value={symbol} aria-label={tl('Symbol')}
          placeholder={tl('symbol')} onInput={(e) => setSymbol(e.currentTarget.value)} />
        <select class={CAT_FIELD} value={type} aria-label={tl('Type')}
          onChange={(e) => setType(e.currentTarget.value)}>
          {CATALYST_TYPES.map((id) => <option key={id} value={id}>{tl(id)}</option>)}
        </select>
        <input class={`${CAT_FIELD} flex-1 min-w-40`} value={label} aria-label={tl('Label')}
          placeholder={tl('what happens that day')}
          onInput={(e) => setLabel(e.currentTarget.value)} />
        <button type="submit"
          class="font-mono text-[11px] px-2 py-1 rounded-md border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-black">
          {tl('add')}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null) }}
          class="font-mono text-[11px] px-2 py-1 rounded-md border border-line text-muted hover:text-ink hover:border-line-2">
          {tl('cancel')}
        </button>
        {error && <span class="font-mono text-[10px] text-down">{error}</span>}
      </form>
    </footer>
  )
}

// Live mono countdown: `time to event` while pre, `since release` after —
// the same field just flips which direction it counts (Jeff wanted the panel
// itself to read as a clock, not a static timestamp).
function EventCountdown({ at, phase, now }) {
  if (at == null) return null
  const ms = phase === 'pre' ? at - now : now - at
  return (
    <span class="font-mono text-[11px] tabular-nums text-accent whitespace-nowrap">
      {phase === 'pre' ? <>{tl('time to event')}</> : <>{tl('since release')}</>} {formatCountdown(ms)}
    </span>
  )
}

// Prior · consensus · actual in one tabular-mono strip. An absent number is
// an honest em dash — this is the one place in the workspace that would be
// lying if it ever filled a blank in.
function EventNumbers({ event }) {
  const nums = eventNumbers(event)
  const cell = (labelNode, value) => (
    <div class="flex flex-col items-center gap-0.5 flex-1">
      <dt class="font-mono text-[9px] uppercase tracking-wider text-muted">{labelNode}</dt>
      <dd class="font-mono text-[13px] tabular-nums text-ink">
        {value == null ? '—' : `${value}${nums.unit}`}
      </dd>
    </div>
  )
  const empty = nums.prior == null && nums.consensus == null && nums.actual == null
  return (
    <div class="border border-line rounded-lg px-3 py-2">
      <dl class="flex items-stretch justify-around gap-3">
        {cell(<>{tl('Prior')}</>, nums.prior)}
        {cell(<>{tl('Consensus')}</>, nums.consensus)}
        {cell(<>{tl('Actual')}</>, nums.actual)}
      </dl>
      {empty && (
        <p class="mt-1.5 text-center font-mono text-[10px] text-muted">
          {tl('no consensus published for this event')}
        </p>
      )}
    </div>
  )
}

// One linked symbol in the dashboard's own row grammar — price + change,
// nothing bespoke. Market direction is the only thing on this row allowed
// red/green; the "why" stays muted amber-adjacent text.
function EventLinkRow({ row, quotes }) {
  const q = quotes[row.symbol]
  const up = (q?.pct ?? 0) >= 0
  return (
    <a href={hrefFor('research', row.symbol.toLowerCase())}
      class="flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-surface-3">
      <span class="min-w-0">
        <span class="font-mono text-[11px] font-semibold text-ink">{row.symbol}</span>
        <span class="block text-[9.5px] text-muted truncate max-w-[220px]">{tl(row.why)}</span>
      </span>
      <span class="flex items-baseline gap-1.5 shrink-0 font-mono text-[11px]">
        {q ? <FlashPrice price={q.price} fmt={fmtPrice} /> : '—'}
        {q && <span class={up ? 'text-up' : 'text-down'}>{fmtPct(q.pct)}</span>}
      </span>
    </a>
  )
}

// Related fragwire stories for the event's own symbol (or its lead link when
// the event has none of its own, e.g. a macro print). No endpoint configured
// or the wire being unreachable both degrade to a plain line — never a
// broken panel (this page is public and ships with no wire by default).
function EventWire({ symbol }) {
  // Symbol-scoped reads are a Fragwire feature: the public mirror ships no
  // symbol index and answers ?symbols= with an empty list, so asking it can
  // only cost a request and then read as "wire unavailable".
  const base = wireServiceUrl()
  const [rows, setRows] = useState(() => (symbol ? peekSymbolWire(symbol) : null))
  useEffect(() => {
    if (!symbol) { setRows(null); return undefined }
    let dead = false
    setRows(peekSymbolWire(symbol) ?? null)
    if (!base) return undefined
    fetchSymbolWire(base, symbol)
      .then((events) => { if (!dead) setRows(events) })
      .catch(() => { if (!dead) setRows([]) })
    return () => { dead = true }
  }, [symbol, base])

  return (
    <div class="border border-line rounded-lg px-3 py-2">
      <h4 class="font-mono text-[10px] uppercase tracking-wider text-accent mb-1">{tl('Related stories')}</h4>
      {!base ? (
        <p class="font-mono text-[10px] text-muted">{tl('no wire endpoint configured')}</p>
      ) : !rows?.length ? (
        <p class="font-mono text-[10px] text-muted">{tl('wire unavailable')}</p>
      ) : (
        <ul class="flex flex-col gap-1">
          {rows.slice(0, 5).map((e) => (
            <li key={e.id} class="font-mono text-[10.5px] text-ink-2 truncate">
              {evHeadline(e, getLocale())}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// What arming this event's alert would actually do, disclosed BEFORE the arm
// button — channel, cooldown, hourly budget — then a single browser alert on
// a 2% trigger above the last print. Browser alerts only: this never places
// or submits an order, it just watches a symbol.
function EventAlertArm({ event, links, quotes }) {
  const [destinations, setDestinations] = useState([])
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    let dead = false
    fetchAlertDestinations().then((d) => { if (!dead) setDestinations(d) }).catch(() => {})
    return () => { dead = true }
  }, [])
  const symbol = event.symbol || links[0]?.symbol || ''
  const q = quotes[symbol]
  const delivery = getAlertDeliveryPrefs()
  const plan = eventAlertPlan({ symbol, price: q?.price ?? null, delivery, destinations })

  const arm = () => {
    if (!plan.ready || !plan.suggested) return
    addAlert({
      symbol: plan.symbol, type: 'price',
      operator: plan.suggested.operator, value: plan.suggested.value,
      delivery,
    })
    setArmed(true)
  }

  return (
    <div class="border border-line rounded-lg px-3 py-2 flex flex-col gap-1.5">
      <dl class="grid grid-cols-3 gap-2 font-mono text-[9.5px]">
        <div>
          <dt class="uppercase tracking-wider text-muted">{tl('Channel')}</dt>
          <dd class="text-ink truncate">{plan.channel}</dd>
        </div>
        <div>
          <dt class="uppercase tracking-wider text-muted">{tl('Cooldown')}</dt>
          <dd class="text-ink">{plan.cooldownMinutes}m</dd>
        </div>
        <div>
          <dt class="uppercase tracking-wider text-muted">{tl('Delivery budget')}</dt>
          <dd class="text-ink">{plan.budget}</dd>
        </div>
      </dl>
      {plan.suggested && (
        <p class="font-mono text-[10px] text-muted">
          {tl('Level')} {plan.suggested.operator} {plan.suggested.value}
        </p>
      )}
      <button onClick={arm} disabled={!plan.ready || !plan.suggested || armed}
        class="self-start font-mono text-[11px] px-2 py-1 rounded-md border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-black disabled:opacity-40">
        {armed ? <>{tl('Alert armed')}</> : <>{tl('Arm alert')}</>}
      </button>
      <p class="font-mono text-[9px] text-muted">{tl('browser alert only — nothing is ordered')}</p>
    </div>
  )
}

// The full event workspace: opens IN PLACE of the calendar list (see Calendar
// below) rather than as a card or a modal — one hairline-structured panel
// that owns the column, facts on the left and links/wire/alert on the right.
function EventWorkspace({ event, details }) {
  const kind = eventKind(event)
  const narrative = eventNarrative(event)
  const links = useMemo(() => eventLinkedSymbols(event), [event.type, event.symbol])
  const symbols = useMemo(() => links.map((l) => l.symbol), [links])
  const clock = useMemo(() => eventClock(event, details.time), [event.date, details.time])
  const [now, setNow] = useState(Date.now())
  // The countdown prints seconds, so it has to be 1 Hz — but only while
  // someone can see it. This re-renders the entire workspace (numbers, links,
  // wire panel, reaction table) on every tick, which is the most expensive
  // second-hand in the app to leave running against a buried tab.
  useEffect(() => startVisibleClock(1000, () => setNow(Date.now())), [])
  const phase = eventPhase(clock.at, now)
  const quotes = useQuotes(symbols)
  const numbers = eventNumbers(event)
  const surprise = eventSurprise(numbers)

  const [bars, setBars] = useState({})
  useEffect(() => {
    if (phase === 'pre') { setBars({}); return undefined }
    let dead = false
    Promise.all(symbols.map((s) =>
      fetchHistory(s, '1D').then((r) => [s, r.bars || []]).catch(() => [s, []]),
    )).then((pairs) => { if (!dead) setBars(Object.fromEntries(pairs)) })
    return () => { dead = true }
  }, [phase, symbols.join(',')])

  const reaction = eventReaction(links, { bars, quotes, at: clock.at })

  return (
    <section data-event-phase={phase}
      class="bg-surface-1 border border-line rounded-xl overflow-hidden flex-1 min-w-0 flex flex-col">
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2 flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-mono text-[10px] font-bold text-accent border border-accent/30 rounded px-1.5 py-0.5">
            {kind}
          </span>
          <span class="font-mono text-[10px] uppercase tracking-wider text-muted">
            {phase === 'pre'
              ? <>{tl('awaiting release')}</>
              : phase === 'post' ? <>{tl('released')}</> : <>{tl('in release window')}</>}
          </span>
        </div>
        <EventCountdown at={clock.at} phase={phase} now={now} />
      </header>

      <div class="px-3 py-2 border-b border-line">
        <h2 class="font-anth font-semibold text-[16px] text-ink">
          {event.user ? event.label : tl(event.label)}
        </h2>
        {!clock.exact && (
          <p class="mt-0.5 font-mono text-[9.5px] text-muted">
            {tl('counting to the cash open — this event has no fixed print time')}
          </p>
        )}
      </div>

      <div class="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-3 p-3 overflow-x-auto">
        <div class="min-w-0 flex flex-col gap-3">
          <EventNumbers event={event} />
          {phase !== 'pre' && surprise && (
            <div class="font-mono text-[11px] text-ink">
              {tl('Surprise')}:{' '}
              <span class={
                surprise.direction === 'above' ? 'text-up'
                  : surprise.direction === 'below' ? 'text-down' : 'text-ink-2'
              }>
                {surprise.delta > 0 ? '+' : ''}{surprise.delta}{numbers.unit}
              </span>
            </div>
          )}

          <div class="border border-line rounded-lg px-3 py-2">
            <h4 class="font-mono text-[10px] uppercase tracking-wider text-accent mb-1">{tl('What it is')}</h4>
            <p class="text-[12px] text-ink-2 leading-relaxed">{tl(narrative.plain)}</p>
            <h4 class="font-mono text-[10px] uppercase tracking-wider text-accent mt-2 mb-1">{tl('Why it matters')}</h4>
            <p class="text-[12px] text-ink-2 leading-relaxed">{tl(narrative.matters)}</p>
            <h4 class="font-mono text-[10px] uppercase tracking-wider text-accent mt-2 mb-1">{tl('Affected sectors')}</h4>
            <p class="text-[11px] text-ink-2">{narrative.sectors.map((s) => tl(s)).join(' · ')}</p>
          </div>

          {phase !== 'pre' && (
            <div class="border border-line rounded-lg px-3 py-2">
              <h4 class="font-mono text-[10px] uppercase tracking-wider text-accent mb-1">
                {tl('first market reaction')}
              </h4>
              {!reaction.ready ? (
                <p class="font-mono text-[10px] text-muted">{tl('no reaction data yet')}</p>
              ) : (
                <div class="flex flex-col gap-1">
                  {reaction.rows.map((row) => (
                    <div key={row.symbol} class="flex items-center justify-between font-mono text-[11px] gap-2">
                      <span class="text-ink">{row.symbol}</span>
                      <span class="text-muted text-[9.5px] flex-1 text-right truncate">
                        {row.source === 'session' ? tl('session move') : tl('move since the release')}
                      </span>
                      <span class={row.pct == null ? 'text-muted' : row.pct >= 0 ? 'text-up' : 'text-down'}>
                        {row.pct == null ? '—' : fmtPct(row.pct)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {details.facts.length > 0 && (
            <div class="border border-line rounded-lg px-3 py-2">
              <h4 class="font-mono text-[10px] uppercase tracking-wider text-accent mb-1">{tl('Event facts')}</h4>
              <dl class="grid grid-cols-2 gap-x-4 gap-y-1.5">
                {details.facts.map((fact) => (
                  <div key={fact.label}>
                    <dt class="font-mono text-[9px] uppercase tracking-wider text-muted">{tl(fact.label)}</dt>
                    <dd class="font-mono text-[11px] text-ink break-words">{tl(fact.value)}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {details.url && (
            <a href={details.url} target="_blank" rel="noreferrer"
              class="self-start inline-flex font-mono text-[10px] text-accent hover:underline">
              {tl('Open official source')} ↗
            </a>
          )}
        </div>

        <div class="flex flex-col gap-3 min-w-0">
          <div class="border border-line rounded-lg px-2 py-2">
            <h4 class="font-mono text-[10px] uppercase tracking-wider text-accent mb-1 px-1">
              {tl('Linked symbols')}
            </h4>
            <div class="flex flex-col">
              {links.map((row) => <EventLinkRow key={row.symbol} row={row} quotes={quotes} />)}
            </div>
          </div>
          <EventWire symbol={event.symbol || links[0]?.symbol} />
          <EventAlertArm event={event} links={links} quotes={quotes} />
        </div>
      </div>
    </section>
  )
}

function Calendar() {
  const today = new Date().toISOString().slice(0, 10)
  const [cats, setCats] = useState(loadCatalysts)
  const [openKey, setOpenKey] = useState('')
  useEscape(() => setOpenKey(''), !!openKey)
  useEffect(() => onCatalystsChange(setCats), [])
  // Three days of look-back here. The enlarged view is where you go to reason
  // about a run of prints, so the week's releases should still be on it rather
  // than vanishing one at a time as they land (Jeff 2026-08-07).
  const events = mergedEvents(ECON_EVENTS, cats, today, 90, 3)
  const eventKey = (event) => `${event.date}-${event.type}-${event.id ?? ''}`
  const openEvent = events.find((event) => eventKey(event) === openKey)
  const details = openEvent ? calendarEventDetails(openEvent) : null
  // Index of the first row that has not happened yet — where the rule goes.
  const firstFuture = events.findIndex((e) => e.days >= 0)

  // Opening an event routes IN PLACE of the calendar list — the panel owns
  // the full column instead of stacking a second surface under the table.
  // "back to calendar" (or Escape, still wired above) is the only way out.
  if (openEvent && details) {
    return (
      <div class="flex-1 min-w-0 flex flex-col gap-2">
        <button onClick={() => setOpenKey('')}
          class="self-start font-mono text-[11px] text-muted hover:text-accent">
          ← {tl('back to calendar')}
        </button>
        <EventWorkspace event={openEvent} details={details} />
      </div>
    )
  }

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden max-w-3xl">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Economic calendar — next 90 days')}
        </h2>
      </header>
      {/* table-fixed with explicit widths. On auto layout the NAME column
          absorbs every pixel of slack, so the empty space between a short
          label and the right-aligned day count grew and shrank with zoom and
          content -- which reads as a black column that comes and goes (Jeff
          2026-08-07). Fixed proportions make it identical at every zoom. */}
      <table class="w-full border-collapse table-fixed">
        <colgroup>
          <col class="w-[27%]" /><col class="w-[15%]" />
          <col class="w-[42%]" /><col class="w-[16%]" />
        </colgroup>
        <tbody>
          {events.map((e, i) => {
            const cls = URGENCY.find((u) => e.days <= u.max).cls
            const key = eventKey(e)
            const isOpen = key === openKey
            const toggle = () => setOpenKey(isOpen ? '' : key)
            return (
              <tr key={key}
                  role="button" tabIndex={0} aria-expanded={isOpen}
                  onClick={toggle}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      toggle()
                    }
                  }}
                  class={`border-b border-line last:border-0 hover:bg-surface-3 group cursor-pointer${
                    isOpen ? ' bg-surface-3' : ''}${e.days < 0 ? ' is-past' : ''}${
                    i === firstFuture && firstFuture > 0 ? ' is-now' : ''}`}>
                <td class="px-3 py-[3px] font-mono text-[12px] text-ink">{e.date}</td>
                <td class={`px-2 py-[3px] font-mono font-bold text-[11px] ${e.user ? 'text-[#00c8ff]' : cls}`}>{e.type}</td>
                <td class="px-2 py-[3px] text-[12px] text-ink-2">
                  {e.user ? e.label : tl(e.label)}
                  {e.user && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation()
                        if (isOpen) setOpenKey('')
                        removeCatalyst(e.id)
                      }}
                      class="ml-2 font-mono text-[10px] text-muted opacity-0 group-hover:opacity-100 max-md:opacity-100 hover:text-down"
                      title={tl('remove catalyst')}
                    >
                      ✕
                    </button>
                  )}
                </td>
                <td class={`px-3 py-[3px] font-mono text-[11px] text-right ${e.days < 0 ? 'text-muted/60' : cls}`}>
                  {e.days === 0 ? tl('today') : eventDayLabel(e.days)}
                  <span class="ml-1.5 text-muted" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <CatalystAdd today={today} />
    </section>
  )
}

export function Markets({ route }) {
  const view = route.sub || 'overview'
  // min-w-0: a flex child sizes to min-content without it, and the widest
  // nowrap table blew the whole page out to ~880px on a phone
  // (Jeff 2026-08-06: "markets view borked on mobile")
  return (
    <div class="flex-1 min-w-0 p-3 select-text markets-page font-anth">
      {view === 'overview' && <Overview />}
      {view === 'movers' && <Movers />}
      {view === 'sectors' && <Sectors />}
      {view === 'heatmap' && <Heatmap />}
      {view === 'commodities' && <Commodities />}
      {view === 'earnings' && <EarningsTab />}
      {view === 'calendar' && <Calendar />}
    </div>
  )
}
