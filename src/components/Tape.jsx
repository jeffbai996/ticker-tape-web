import { useQuotes, useWatchlist } from '../hooks.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { hrefFor } from '../lib/route.js'

// The namesake: a continuously scrolling quote marquee. The list is doubled
// so the -50% keyframe loops seamlessly.

export function Tape() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  const items = watchlist.map((s) => ({ symbol: s, q: quotes[s]?.quote }))

  return (
    <div class="h-7 shrink-0 bg-surface-0 border-b border-line overflow-hidden relative">
      <div class="tape-scroll flex items-center h-full gap-6 w-max font-mono text-[11px] pr-6">
        {[...items, ...items].map(({ symbol, q }, i) => {
          const up = (q?.pct ?? 0) >= 0
          return (
            <a
              key={`${symbol}-${i}`}
              href={hrefFor('research', symbol.toLowerCase())}
              class="flex items-baseline gap-1.5 whitespace-nowrap hover:no-underline group rounded px-1.5 -mx-1 py-0.5 hover:bg-accent-soft hover:outline hover:outline-1 hover:outline-accent/40 transition-colors"
            >
              <span class="text-ink font-bold group-hover:text-accent" style="font-family: 'Plus Jakarta Sans', sans-serif">{symbol}</span>
              <span class="text-ink-2">{q ? fmtPrice(q.price) : '—'}</span>
              {q && <span class={up ? 'text-up' : 'text-down'}>{fmtPct(q.pct)}</span>}
            </a>
          )
        })}
      </div>
    </div>
  )
}
