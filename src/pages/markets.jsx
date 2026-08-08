import { useEffect, useState } from 'preact/hooks'
import { fetchHistory } from '../lib/history.js'
import { BUCKETS } from '../lib/symbols.js'
import { useQuotes, useWatchlist } from '../hooks.js'
import { AiReport } from '../components/AiReport.jsx'
import { BRIEFING_SYSTEM } from '../lib/briefing.js'
import { EARNINGS_UNIVERSE,
  MARKET_GROUPS, SECTORS, COMMODITY_GROUPS, ECON_EVENTS, RELATIVE_SIGNALS, eventDayLabel,
  upcomingEvents, calendarEventDetails,
} from '../lib/markets.js'
import { loadCatalysts, onCatalystsChange, removeCatalyst, mergedEvents } from '../lib/catalysts.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { tl } from '../lib/i18n.js'
import { EarningsDay } from '../components/EarningsDay.jsx'
import { fmtPrice, fmtPct, fmtChange, fmtVol } from '../lib/format.js'
import { Histo } from '../components/Histo.jsx'
import { FlashMetric, FlashPrice } from '../components/Fig.jsx'
import { hrefFor } from '../lib/route.js'
import { sessionMeter } from '../lib/format.js'
import { extendedLabelClass } from '../lib/extendedHours.js'

/** The day's session on one 56px track: the grey rail is today's range, the
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
  const pct = (v) => `${(v * 100).toFixed(1)}%`
  const tone = m.up ? 'bg-up' : 'bg-down'
  const title = `${fmtPrice(q.dayLow)} – ${fmtPrice(q.dayHigh)}`
    + (q.prevClose != null ? ` · ${tl('prev close')} ${fmtPrice(q.prevClose)}` : '')
    + (m.gap ? ` · ${tl('gap')}` : '')
  return (
    <span class="relative block w-14 h-[7px]" title={title}>
      <span class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-[3px] bg-line rounded-full" />
      {/* travelled span — zero-width on a flat tape, so a dead row looks dead */}
      <span class={`absolute top-1/2 -translate-y-1/2 h-[3px] rounded-full ${tone} opacity-70`}
            style={{ left: pct(m.from), width: pct(Math.max(0, m.to - m.from)) }} />
      {m.prevPos != null && (
        <span class="absolute top-1/2 -translate-y-1/2 w-px h-[5px] bg-muted/70"
              style={{ left: pct(m.prevPos) }} />
      )}
      <span class={`absolute top-1/2 -translate-y-1/2 w-[3px] h-[7px] rounded-sm ${tone}`}
            style={{ left: `calc(${pct(m.pos)} - 1.5px)` }} />
    </span>
  )
}

/** A yield spread computed from two rows above it — inverted curves are the
 *  point, so the sign gets the colour rather than the day's direction. */
function SpreadRow({ label, hint, spread, quotes, withUnits = false }) {
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
      <td colSpan={withUnits ? 4 : 3} />
    </tr>
  )
}

function QuoteRow({ label, symbol, data, unit, withUnits = false }) {
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
        {q ? <FlashMetric value={q.pct} fmt={fmtPct} /> : ''}
      </td>
      <td class="px-2 py-[3px] hidden @[380px]:table-cell w-14"><DayMeter q={q} /></td>
      <td class="px-2 py-[3px] hidden @[460px]:table-cell">
        <Histo bars={data?.histo} width={84} class="w-[84px] @max-[560px]:w-[52px]" />
      </td>
    </tr>
  )
}

const groupId = (name) => `market-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`

function GroupCard({ name, items, quotes, withUnits }) {
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
                       spread={it.spread} quotes={quotes} withUnits={withUnits} />
          ) : (
            <QuoteRow
              key={it.symbol}
              symbol={it.symbol}
              label={tl(it.label)}
              unit={it.unit}
              withUnits={withUnits}
              data={quotes[it.symbol]}
            />
          )))}
        </tbody>
      </table>
    </section>
  )
}

function MarketJumpBar() {
  return (
    <nav class="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2" aria-label={tl('Market groups')}>
      <span class="font-anth text-[9px] uppercase tracking-wider text-muted shrink-0 mr-1">{tl('Jump to')}</span>
      {MARKET_GROUPS.map((group) => (
        <button key={group.name} type="button"
          onClick={() => document.getElementById(groupId(group.name))?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          class="shrink-0 rounded-full border border-line px-2.5 py-1 font-anth text-[10px] text-ink-2 hover:text-accent hover:border-accent/50 hover:no-underline">
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
  return (
    <div>
      <MarketJumpBar />
      {/* CSS columns, not a grid: a grid row is as tall as its tallest card,
          so a 2-row Canada beside a 10-row Asia-Pacific left a slab of black
          under it. Columns pack each card against the one above (Jeff
          2026-08-06: "no need to align the boxes like that"). */}
      <div class="md:columns-2 xl:columns-3 min-[1800px]:columns-4 gap-2 [&>*]:mb-2 md:[&>*]:break-inside-avoid">
        {MARKET_GROUPS.map((g) => (
          <GroupCard key={g.name} name={g.name} items={g.items} quotes={quotes} />
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
    SECTORS.forEach(({ symbol }, i) => {
      setTimeout(() => {
        if (!dead) {
          fetchHistory(symbol, '3M')
            .then((h) => !dead && setHist((cur) => ({ ...cur, [symbol]: h?.bars || [] })))
            .catch(() => {})
        }
      }, i * 150)
    })
    return () => { dead = true }
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
  const adv = priced.filter((r) => r.q.pct >= 0).length
  const avg = priced.length ? priced.reduce((s2, r) => s2 + r.q.pct, 0) / priced.length : null
  const stress = priced.filter((r) => r.q.pct <= -3).length
  const big = priced.filter((r) => Math.abs(r.q.pct) >= 2).length

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
          ['breadth', <span><span class="text-up">{adv}</span><span class="text-muted">/</span><span class="text-down">{priced.length - adv}</span></span>],
          ['avg move', <span class={avg != null && avg >= 0 ? 'text-up' : 'text-down'}>{avg != null ? fmtPct(avg) : '—'}</span>],
          ['±2% movers', <span class="text-ink">{big}<span class="text-muted">/{priced.length}</span></span>],
          ['down >3%', <span class={stress ? 'text-down font-bold' : 'text-ink-2'}>{stress}</span>],
        ].map(([label, val]) => (
          <span key={label} class="bg-surface-1 border border-line rounded-lg px-2.5 py-1 flex items-baseline gap-1.5">
            <span class="text-[9px] uppercase tracking-wider text-muted">{label}</span>{val}
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

function Calendar() {
  const today = new Date().toISOString().slice(0, 10)
  const [cats, setCats] = useState(loadCatalysts)
  const [openKey, setOpenKey] = useState('')
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
      {openEvent && details && (
        <aside class="border-t border-line-2 bg-surface-2 px-3 py-3" aria-label={tl('Event details')}>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-[10px] font-bold text-accent border border-accent/30 rounded px-1.5 py-0.5">
                  {openEvent.type}
                </span>
                <h3 class="font-anth font-semibold text-[14px] text-ink">
                  {openEvent.user ? openEvent.label : tl(openEvent.label)}
                </h3>
              </div>
              {details.description && (
                <p class="mt-2 text-[12px] leading-relaxed text-ink-2 max-w-2xl">{tl(details.description)}</p>
              )}
            </div>
            <button onClick={() => setOpenKey('')} class="shrink-0 text-muted hover:text-ink px-1"
                    aria-label={tl('Close event details')}>✕</button>
          </div>

          <dl class="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-2">
            <div>
              <dt class="font-mono text-[9px] uppercase tracking-wider text-muted">{tl('Date')}</dt>
              <dd class="font-mono text-[12px] text-ink">{openEvent.date}</dd>
            </div>
            <div>
              <dt class="font-mono text-[9px] uppercase tracking-wider text-muted">{tl('Typical time')}</dt>
              <dd class="font-mono text-[12px] text-ink">{details.time || '—'}</dd>
            </div>
            <div>
              <dt class="font-mono text-[9px] uppercase tracking-wider text-muted">{tl('Source')}</dt>
              <dd class="text-[12px] text-ink">{tl(details.source) || '—'}</dd>
            </div>
            {details.facts.map((fact) => (
              <div key={fact.label}>
                <dt class="font-mono text-[9px] uppercase tracking-wider text-muted">{tl(fact.label)}</dt>
                <dd class="font-mono text-[12px] text-ink break-words">{tl(fact.value)}</dd>
              </div>
            ))}
          </dl>

          {details.url && (
            <a href={details.url} target="_blank" rel="noreferrer"
               class="inline-flex mt-3 font-mono text-[10px] text-accent hover:underline">
              {tl('Open official source')} ↗
            </a>
          )}
        </aside>
      )}
      <footer class="px-3 py-1.5 border-t border-line font-mono text-[10px] text-muted">
        {tl('add your own')}: <span class="text-ink-2">cat add 2026-09-09 NVDA product GTC keynote</span>
      </footer>
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
