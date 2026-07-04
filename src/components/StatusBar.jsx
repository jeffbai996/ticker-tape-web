import { useEffect, useState } from 'preact/hooks'
import { useQuotes } from '../hooks.js'
import { INDICES } from '../lib/symbols.js'
import { fmtPrice, fmtPct } from '../lib/format.js'

const INDEX_SYMBOLS = INDICES.map((i) => i.symbol)

function marketState(now) {
  // NYSE regular session in ET; coarse open/closed until a proper
  // holiday-aware market-state feed lands.
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const day = et.getDay()
  const mins = et.getHours() * 60 + et.getMinutes()
  const open = day >= 1 && day <= 5 && mins >= 570 && mins < 960
  return open ? { label: 'OPEN', live: true } : { label: 'CLOSED', live: false }
}

export function StatusBar() {
  const [now, setNow] = useState(() => new Date())
  const quotes = useQuotes(INDEX_SYMBOLS)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const state = marketState(now)
  const clock = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' })

  return (
    <header class="flex items-center gap-4 px-3 h-9 shrink-0 bg-surface-1 border-b border-line font-mono text-[11px]">
      <span class="font-bold text-accent tracking-tight text-[13px]">ticker-tape</span>

      <div class="flex-1 flex items-center gap-4 overflow-x-auto min-w-0 no-scrollbar">
        {INDICES.map(({ symbol, label }) => {
          const q = quotes[symbol]?.quote
          const up = (q?.pct ?? 0) >= 0
          return (
            <span key={symbol} class="flex items-baseline gap-1.5 whitespace-nowrap">
              <span class="text-muted">{label}</span>
              <span class="text-ink-2">{q ? fmtPrice(q.price) : '—'}</span>
              {q && <span class={up ? 'text-up' : 'text-down'}>{fmtPct(q.pct)}</span>}
            </span>
          )
        })}
      </div>

      <span class="flex items-center gap-1.5 whitespace-nowrap">
        <span class={`inline-block w-1.5 h-1.5 rounded-full ${state.live ? 'bg-up' : 'bg-muted'}`} />
        <span class={state.live ? 'text-up' : 'text-muted'}>{state.label}</span>
      </span>
      <span class="text-ink-2 whitespace-nowrap">{clock} ET</span>
    </header>
  )
}
