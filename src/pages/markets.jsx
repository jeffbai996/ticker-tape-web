import { useEffect, useState } from 'preact/hooks'
import { fetchHistory } from '../lib/history.js'
import { BUCKETS } from '../lib/symbols.js'
import { useQuotes, useWatchlist } from '../hooks.js'
import { AiReport } from '../components/AiReport.jsx'
import { BRIEFING_SYSTEM } from '../lib/briefing.js'
import { MARKET_GROUPS, SECTORS, COMMODITY_GROUPS, ECON_EVENTS, upcomingEvents } from '../lib/markets.js'
import { loadCatalysts, onCatalystsChange, removeCatalyst, mergedEvents } from '../lib/catalysts.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { tl } from '../lib/i18n.js'
import { EarningsDay } from '../components/EarningsDay.jsx'
import { fmtPrice, fmtPct, fmtChange, fmtVol } from '../lib/format.js'
import { Histo } from '../components/Histo.jsx'
import { FlashPrice } from '../components/Fig.jsx'
import { hrefFor } from '../lib/route.js'
import { rangePos } from '../lib/format.js'

/** Where the last trade sits inside today's range — the dashboard's meter,
 *  shrunk to fit a table cell. */
function DayMeter({ q }) {
  const pos = rangePos(q?.dayLow, q?.dayHigh, q?.price)
  if (pos == null) return null
  return (
    <span class="relative block w-12 h-[3px] bg-line rounded-full"
          title={`${fmtPrice(q.dayLow)} – ${fmtPrice(q.dayHigh)}`}>
      <span class="absolute top-1/2 -translate-y-1/2 w-[3px] h-[7px] bg-accent-2 rounded-sm"
            style={{ left: `calc(${(pos * 100).toFixed(1)}% - 1.5px)` }} />
    </span>
  )
}

/** A yield spread computed from two rows above it — inverted curves are the
 *  point, so the sign gets the colour rather than the day's direction. */
function SpreadRow({ label, hint, spread, quotes }) {
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
      <td colSpan={3} />
    </tr>
  )
}

function QuoteRow({ label, symbol, data, unit }) {
  const q = data?.quote
  const up = (q?.pct ?? 0) >= 0
  const tone = q ? (up ? 'text-up' : 'text-down') : 'text-muted'
  return (
    <tr
      class="border-b border-line last:border-0 hover:bg-white/[0.035] cursor-pointer"
      onClick={() => { if (symbol) location.hash = hrefFor('research', symbol.toLowerCase()) }}
    >
      <td class="px-3 py-[3px] text-[12px] text-ink whitespace-nowrap font-anth">{label}</td>
      {unit !== undefined && <td class="px-2 py-[3px] font-tick text-[10px] text-muted">{unit}</td>}
      <td class="px-2 py-[3px] font-mono font-semibold text-[12px] text-ink text-right w-24">
        {q ? <FlashPrice price={q.price} fmt={fmtPrice} /> : '—'}
      </td>
      <td class={`px-2 py-[3px] font-mono text-[11px] text-right w-20 ${tone}`}>
        {q ? fmtChange(q.change) : ''}
      </td>
      <td class={`px-2 py-[3px] font-mono text-[11px] text-right w-16 ${tone}`}>
        {q ? fmtPct(q.pct) : ''}
      </td>
      <td class="px-2 py-[3px] hidden @[380px]:table-cell w-14"><DayMeter q={q} /></td>
      <td class="px-2 py-[3px] hidden @[460px]:table-cell">
        <Histo bars={data?.histo} width={84} class="w-[84px] @max-[560px]:w-[52px]" />
      </td>
    </tr>
  )
}

function GroupCard({ name, items, quotes, withUnits }) {
  const pcts = items.filter((i) => !i.spread)
    .map((i) => quotes[i.symbol]?.quote?.pct).filter((v) => v != null)
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null
  const green = pcts.filter((v) => v >= 0).length
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden @container">
      <header class="flex items-baseline gap-2 px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">{tl(name)}</h2>
        {avg != null && (
          <>
            <span class={`font-mono text-[11px] font-semibold ${avg >= 0 ? 'text-up' : 'text-down'}`}>
              {fmtPct(avg)}
            </span>
            <span class="ml-auto font-mono text-[9.5px] text-muted" title="advancing / total">
              {green}/{pcts.length}
            </span>
          </>
        )}
      </header>
      <table class="w-full border-collapse">
        <tbody>
          {items.map((it) => (it.spread ? (
            <SpreadRow key={it.label} label={tl(it.label)} hint={it.hint}
                       spread={it.spread} quotes={quotes} />
          ) : (
            <QuoteRow
              key={it.symbol}
              symbol={it.symbol}
              label={tl(it.label)}
              unit={withUnits ? it.unit : undefined}
              data={quotes[it.symbol]}
            />
          )))}
        </tbody>
      </table>
    </section>
  )
}

function Overview() {
  const symbols = MARKET_GROUPS.flatMap((g) => g.items.map((i) => i.symbol)).filter(Boolean)
  const quotes = useQuotes(symbols)
  return (
    <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3 min-[1800px]:grid-cols-4">
      {MARKET_GROUPS.map((g) => (
        <GroupCard key={g.name} name={g.name} items={g.items} quotes={quotes} />
      ))}
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
            <th class="px-3 py-1 text-left">sector</th>
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
    <div class="grid gap-2 xl:grid-cols-2 items-start">
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
    <div class="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
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
              <span class="text-[#c084fc]">{q.extLabel}</span> {fmtPct(q.extPct)}
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
            <th class="px-3 py-1 text-left">sym</th>
            <th class="px-2 py-1 text-right">px</th>
            <th class="px-2 py-1 text-right">chg</th>
            <th class="px-2 py-1 text-right">%</th>
            <th class="px-2 py-1 text-right max-xl:hidden">vol</th>
            <th class="px-2 py-1 text-right max-2xl:hidden">ext</th>
            <th class="px-2 py-1 max-xl:hidden">day</th>
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
  // ETFs have no earnings — skip the obvious ones to save requests.
  const named = watchlist.filter((s) => !['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'].includes(s))
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
  useEffect(() => onCatalystsChange(setCats), [])
  const events = mergedEvents(ECON_EVENTS, cats, today, 90)

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden max-w-xl">
      <header class="px-2.5 py-1 border-b border-line-2 bg-surface-2">
        <h2 class="font-anth font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Economic calendar — next 90 days')}
        </h2>
      </header>
      <table class="w-full border-collapse">
        <tbody>
          {events.map((e) => {
            const cls = URGENCY.find((u) => e.days <= u.max).cls
            return (
              <tr key={`${e.date}-${e.type}-${e.id ?? ''}`} class="border-b border-line last:border-0 hover:bg-surface-3 group">
                <td class="px-3 py-[3px] font-mono text-[12px] text-ink">{e.date}</td>
                <td class={`px-2 py-[3px] font-mono font-bold text-[11px] ${e.user ? 'text-[#00c8ff]' : cls}`}>{e.type}</td>
                <td class="px-2 py-[3px] text-[12px] text-ink-2">
                  {e.user ? e.label : tl(e.label)}
                  {e.user && (
                    <button
                      onClick={() => removeCatalyst(e.id)}
                      class="ml-2 font-mono text-[10px] text-muted opacity-0 group-hover:opacity-100 max-md:opacity-100 hover:text-down"
                      title="remove catalyst"
                    >
                      ✕
                    </button>
                  )}
                </td>
                <td class={`px-3 py-[3px] font-mono text-[11px] text-right ${cls}`}>
                  {e.days === 0 ? tl('today') : `${e.days}d`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <footer class="px-3 py-1.5 border-t border-line font-mono text-[10px] text-muted">
        {tl('add your own')}: <span class="text-ink-2">cat add 2026-09-09 NVDA product GTC keynote</span>
      </footer>
    </section>
  )
}

export function Markets({ route }) {
  const view = route.sub || 'overview'
  return (
    <div class="flex-1 p-3 select-text markets-page">
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
