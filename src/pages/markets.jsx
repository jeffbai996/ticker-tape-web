import { useQuotes } from '../hooks.js'
import { MARKET_GROUPS, SECTORS, COMMODITY_GROUPS, ECON_EVENTS, upcomingEvents } from '../lib/markets.js'
import { fmtPrice, fmtPct, fmtChange } from '../lib/format.js'
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
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{name}</h2>
      </header>
      <table class="w-full border-collapse">
        <tbody>
          {items.map((it) => (
            <QuoteRow
              key={it.symbol}
              label={it.label}
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
          Sector ETFs — today
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
              <span class="w-36 text-muted truncate max-sm:hidden">{label}</span>
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
          Economic calendar — next 90 days
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
                <td class="px-2 py-[5px] text-[12px] text-ink-2">{e.label}</td>
                <td class={`px-3 py-[5px] font-mono text-[11px] text-right ${cls}`}>
                  {e.days === 0 ? 'today' : `${e.days}d`}
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
      {view === 'sectors' && <Sectors />}
      {view === 'commodities' && <Commodities />}
      {view === 'calendar' && <Calendar />}
    </div>
  )
}
