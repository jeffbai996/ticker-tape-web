import { useEffect, useState } from 'preact/hooks'
import { useQuotes, useWatchlist } from '../hooks.js'
import { MARKET_GROUPS, SECTORS, COMMODITY_GROUPS, ECON_EVENTS, upcomingEvents } from '../lib/markets.js'
import { fetchEarningsDate } from '../lib/fundamentals.js'
import { tl } from '../lib/i18n.js'
import { fmtPrice, fmtPct, fmtChange, fmtVol } from '../lib/format.js'
import { Spark } from '../components/Spark.jsx'

function QuoteRow({ label, data, unit }) {
  const q = data?.quote
  const up = (q?.pct ?? 0) >= 0
  return (
    <tr class="border-b border-line last:border-0 hover:bg-surface-2">
      <td class="px-3 py-[5px] text-[12px] text-ink whitespace-nowrap">{label}</td>
      {unit !== undefined && <td class="px-2 py-[5px] font-mono text-[10px] text-muted">{unit}</td>}
      <td class="px-2 py-[5px] font-mono text-[12px] text-ink text-right">{q ? fmtPrice(q.price) : '—'}</td>
      <td class={`px-2 py-[5px] font-mono text-[12px] text-right ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
        {q ? fmtChange(q.change) : ''}
      </td>
      <td class={`px-2 py-[5px] font-mono text-[12px] text-right ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
        {q ? fmtPct(q.pct) : ''}
      </td>
      <td class="px-2 py-[5px] hidden @[420px]:table-cell">
        <Spark data={data?.spark} up={up} />
      </td>
    </tr>
  )
}

function GroupCard({ name, items, quotes, withUnits }) {
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden @container">
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{tl(name)}</h2>
      </header>
      <table class="w-full border-collapse">
        <tbody>
          {items.map((it) => (
            <QuoteRow
              key={it.symbol}
              label={tl(it.label)}
              unit={withUnits ? it.unit : undefined}
              data={quotes[it.symbol]}
            />
          ))}
        </tbody>
      </table>
    </section>
  )
}

function Overview() {
  const symbols = MARKET_GROUPS.flatMap((g) => g.items.map((i) => i.symbol))
  const quotes = useQuotes(symbols)
  return (
    <div class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
      {MARKET_GROUPS.map((g) => (
        <GroupCard key={g.name} name={g.name} items={g.items} quotes={quotes} />
      ))}
    </div>
  )
}

function Sectors() {
  const quotes = useQuotes(SECTORS.map((s) => s.symbol))
  const rows = SECTORS.map((s) => ({ ...s, q: quotes[s.symbol]?.quote }))
    .sort((a, b) => (b.q?.pct ?? -99) - (a.q?.pct ?? -99))
  const maxAbs = Math.max(0.01, ...rows.map((r) => Math.abs(r.q?.pct ?? 0)))

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden max-w-2xl">
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Sector ETFs — today')}
        </h2>
      </header>
      <div class="p-2">
        {rows.map(({ symbol, label, q }) => {
          const pct = q?.pct ?? 0
          const up = pct >= 0
          const w = (Math.abs(pct) / maxAbs) * 100
          return (
            <div key={symbol} class="flex items-center gap-2 px-1 py-[3px] font-mono text-[11px]">
              <span class="w-9 font-bold text-ink">{symbol}</span>
              <span class="w-36 text-muted truncate max-sm:hidden">{tl(label)}</span>
              <div class="flex-1 h-3.5 relative">
                <div
                  class={`absolute inset-y-0 left-0 rounded-sm ${up ? 'bg-up/30' : 'bg-down/30'}`}
                  style={{ width: `${w}%` }}
                />
              </div>
              <span class={`w-16 text-right ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
                {q ? fmtPct(pct) : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Commodities() {
  const symbols = COMMODITY_GROUPS.flatMap((g) => g.items.map((i) => i.symbol))
  const quotes = useQuotes(symbols)
  return (
    <div class="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
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
  const tiles = watchlist.map((s) => ({ symbol: s, q: quotes[s]?.quote }))
    .sort((a, b) => (b.q?.pct ?? -99) - (a.q?.pct ?? -99))

  return (
    <div class="grid gap-1.5 max-w-4xl" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
      {tiles.map(({ symbol, q }) => (
        <a
          key={symbol}
          href={`#/research/${symbol.toLowerCase()}`}
          class="rounded-lg border border-line p-2 hover:border-line-2 hover:no-underline"
          style={heatStyle(q?.pct)}
        >
          <div class="font-mono font-bold text-[12px] text-ink">{symbol}</div>
          <div class="font-mono text-[11px] text-ink">{q ? fmtPct(q.pct) : '—'}</div>
          <div class="font-mono text-[10px] text-ink-2">{q ? fmtPrice(q.price) : ''}</div>
        </a>
      ))}
    </div>
  )
}

function MoverTable({ title, rows, metric }) {
  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden">
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{title}</h2>
      </header>
      <table class="w-full border-collapse font-mono text-[11px]">
        <tbody>
          {rows.map(({ symbol, q }) => {
            const up = (q?.pct ?? 0) >= 0
            return (
              <tr key={symbol} class="border-b border-line last:border-0 hover:bg-surface-2 cursor-pointer"
                onClick={() => (location.hash = `#/research/${symbol.toLowerCase()}`)}>
                <td class="px-3 py-[5px] font-bold text-accent">{symbol}</td>
                <td class="px-2 py-[5px] text-right text-ink">{fmtPrice(q?.price)}</td>
                <td class={`px-3 py-[5px] text-right ${up ? 'text-up' : 'text-down'}`}>
                  {metric === 'volume' ? fmtVol(q?.volume) : fmtPct(q?.pct)}
                </td>
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

  return (
    <div class="grid gap-3 lg:grid-cols-3 max-w-5xl">
      <MoverTable title={tl('Gainers')} rows={byPct.slice(0, 10)} />
      <MoverTable title={tl('Losers')} rows={byPct.slice(-10).reverse()} />
      <MoverTable title={tl('Most active')} rows={byVol.slice(0, 10)} metric="volume" />
    </div>
  )
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
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Upcoming earnings — watchlist')}
        </h2>
      </header>
      {upcoming.length === 0 && (
        <div class="px-3 py-3 font-mono text-[11px] text-muted">{tl('loading earnings dates…')}</div>
      )}
      <table class="w-full border-collapse font-mono text-[12px]">
        <tbody>
          {upcoming.map((e) => {
            const cls = e.days <= 7 ? 'text-down' : e.days <= 21 ? 'text-accent' : 'text-ink-2'
            return (
              <tr
                key={e.sym}
                class="border-b border-line last:border-0 hover:bg-surface-2 cursor-pointer"
                onClick={() => (location.hash = `#/research/${e.sym.toLowerCase()}`)}
              >
                <td class="px-3 py-[5px] font-bold text-accent">{e.sym}</td>
                <td class="px-2 py-[5px] text-ink">
                  {new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td class="px-2 py-[5px] text-ink-2 text-right">
                  {e.epsEstimate != null ? `est ${e.epsEstimate.toFixed(2)}` : ''}
                </td>
                <td class={`px-3 py-[5px] text-right ${cls}`}>
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
  const events = upcomingEvents(ECON_EVENTS, today, 90)

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden max-w-xl">
      <header class="px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">
          {tl('Economic calendar — next 90 days')}
        </h2>
      </header>
      <table class="w-full border-collapse">
        <tbody>
          {events.map((e) => {
            const cls = URGENCY.find((u) => e.days <= u.max).cls
            return (
              <tr key={`${e.date}-${e.type}`} class="border-b border-line last:border-0 hover:bg-surface-2">
                <td class="px-3 py-[5px] font-mono text-[12px] text-ink">{e.date}</td>
                <td class={`px-2 py-[5px] font-mono font-bold text-[11px] ${cls}`}>{e.type}</td>
                <td class="px-2 py-[5px] text-[12px] text-ink-2">{tl(e.label)}</td>
                <td class={`px-3 py-[5px] font-mono text-[11px] text-right ${cls}`}>
                  {e.days === 0 ? tl('today') : `${e.days}d`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

export function Markets({ route }) {
  const view = route.sub || 'overview'
  return (
    <div class="flex-1 p-3 select-text">
      {view === 'overview' && <Overview />}
      {view === 'movers' && <Movers />}
      {view === 'sectors' && <Sectors />}
      {view === 'heatmap' && <Heatmap />}
      {view === 'commodities' && <Commodities />}
      {view === 'earnings' && <Earnings />}
      {view === 'calendar' && <Calendar />}
    </div>
  )
}
