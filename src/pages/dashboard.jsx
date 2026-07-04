import { useQuotes } from '../hooks.js'
import { BUCKETS, WATCHLIST } from '../lib/symbols.js'
import { fmtPrice, fmtPct, fmtChange, fmtVol } from '../lib/format.js'
import { Spark } from '../components/Spark.jsx'

function Row({ symbol, data }) {
  const q = data?.quote
  const up = (q?.pct ?? 0) >= 0
  return (
    <tr class="border-b border-line last:border-0 hover:bg-surface-2">
      <td class="px-3 py-[5px] font-mono font-bold text-[12px] text-ink">{symbol}</td>
      <td class="px-2 py-[5px] text-[11px] text-muted max-w-36 truncate hidden @[400px]:table-cell">{q?.name || ''}</td>
      <td class="px-2 py-[5px] font-mono text-[12px] text-ink text-right">{q ? fmtPrice(q.price) : '—'}</td>
      <td class={`px-2 py-[5px] font-mono text-[12px] text-right ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
        {q ? fmtChange(q.change) : ''}
      </td>
      <td class={`px-2 py-[5px] font-mono text-[12px] text-right ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
        {q ? fmtPct(q.pct) : ''}
      </td>
      <td class="px-2 py-[5px]">
        <Spark data={data?.spark} up={up} />
      </td>
      <td class="px-2 py-[5px] font-mono text-[11px] text-ink-2 text-right whitespace-nowrap hidden @[560px]:table-cell">
        {q ? `${fmtPrice(q.dayLow)}–${fmtPrice(q.dayHigh)}` : ''}
      </td>
      <td class="px-3 py-[5px] font-mono text-[11px] text-ink-2 text-right hidden @[460px]:table-cell">
        {q ? fmtVol(q.volume) : ''}
      </td>
    </tr>
  )
}

function BucketCard({ name, symbols, quotes }) {
  const pcts = symbols.map((s) => quotes[s]?.quote?.pct).filter((p) => p != null)
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null

  return (
    <section class="bg-surface-1 border border-line rounded-xl overflow-hidden @container">
      <header class="flex items-baseline gap-3 px-3 py-2 border-b border-line-2 bg-surface-2">
        <h2 class="font-mono font-bold text-[11px] tracking-wider text-accent uppercase">{name}</h2>
        {avg != null && (
          <span class={`font-mono text-[11px] ${avg >= 0 ? 'text-up' : 'text-down'}`}>
            avg {fmtPct(avg)}
          </span>
        )}
      </header>
      <div>
        <table class="w-full border-collapse">
          <tbody>
            {symbols.map((s) => (
              <Row key={s} symbol={s} data={quotes[s]} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export function Dashboard() {
  const quotes = useQuotes(WATCHLIST)
  const all = WATCHLIST.map((s) => quotes[s]?.quote?.pct).filter((p) => p != null)
  const breadth = all.length ? all.filter((p) => p >= 0).length : null

  return (
    <div class="flex-1 p-3 select-text">
      <div class="flex items-baseline gap-4 px-1 pb-2 font-mono text-[11px]">
        <span class="text-muted">
          BREADTH{' '}
          <span class="text-ink-2">
            {breadth != null ? `${breadth}/${all.length} advancing` : '—'}
          </span>
        </span>
        {all.length > 0 && (
          <span class="text-muted">
            AVG{' '}
            <span class={all.reduce((a, b) => a + b, 0) >= 0 ? 'text-up' : 'text-down'}>
              {fmtPct(all.reduce((a, b) => a + b, 0) / all.length)}
            </span>
          </span>
        )}
      </div>
      <div class="grid gap-3 xl:grid-cols-2">
        {BUCKETS.map((b) => (
          <BucketCard key={b.name} name={b.name} symbols={b.symbols} quotes={quotes} />
        ))}
      </div>
    </div>
  )
}
