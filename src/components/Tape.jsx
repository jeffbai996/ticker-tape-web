import { useQuotes } from '../hooks.js'
import { WATCHLIST } from '../lib/symbols.js'
import { fmtPrice, fmtPct } from '../lib/format.js'

// The namesake: a continuously scrolling quote marquee. The list is doubled
// so the -50% keyframe loops seamlessly.

export function Tape() {
  const quotes = useQuotes(WATCHLIST)
  const items = WATCHLIST.map((s) => ({ symbol: s, q: quotes[s]?.quote }))

  return (
    <div class="h-7 shrink-0 bg-surface-0 border-b border-line overflow-hidden relative">
      <div class="tape-scroll flex items-center h-full gap-6 w-max font-mono text-[11px] pr-6">
        {[...items, ...items].map(({ symbol, q }, i) => {
          const up = (q?.pct ?? 0) >= 0
          return (
            <span key={`${symbol}-${i}`} class="flex items-baseline gap-1.5 whitespace-nowrap">
              <span class="text-ink font-bold">{symbol}</span>
              <span class="text-ink-2">{q ? fmtPrice(q.price) : '—'}</span>
              {q && <span class={up ? 'text-up' : 'text-down'}>{fmtPct(q.pct)}</span>}
            </span>
          )
        })}
      </div>
    </div>
  )
}
