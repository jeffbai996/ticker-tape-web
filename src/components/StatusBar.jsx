import { useEffect, useState } from 'preact/hooks'
import { useQuotes } from '../hooks.js'
import { INDICES } from '../lib/symbols.js'
import { marketState } from '../lib/marketState.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { tl, getLocale, setLocale } from '../lib/i18n.js'

// Session-state chip styling — mirrors the TUI's --open/--pre/--post/--closed
// status classes. Post-market shares the purple used for AH quotes.
const STATE_CHIP = {
  open: 'text-up border-up/50 bg-up/10',
  pre: 'text-accent border-accent/50 bg-accent-soft',
  post: 'text-[#c084fc] border-[#c084fc]/50 bg-[#c084fc]/10',
  closed: 'text-muted border-line-2 bg-surface-2',
}

// Outside regular hours the cash indices freeze — swap in the 24h futures
// contracts, exactly like the TUI status bar does.
const FUTURES_SWAP = { '^GSPC': { symbol: 'ES=F', label: 'ES' }, '^IXIC': { symbol: 'NQ=F', label: 'NQ' } }

function vixClass(price) {
  if (price == null) return 'text-ink-2'
  if (price > 30) return 'text-down font-bold'
  if (price > 25) return 'text-down'
  if (price > 20) return 'text-accent'
  return 'text-up'
}

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    addEventListener('online', up)
    addEventListener('offline', down)
    return () => { removeEventListener('online', up); removeEventListener('offline', down) }
  }, [])
  return online
}

export function StatusBar() {
  const [now, setNow] = useState(() => new Date())
  const online = useOnline()

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const { state, holiday } = marketState(now)
  const strip = INDICES.map((i) =>
    state !== 'open' && FUTURES_SWAP[i.symbol] ? FUTURES_SWAP[i.symbol] : i)
  const quotes = useQuotes(strip.map((i) => i.symbol))
  const clock = now.toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' })
  const chipLabel = holiday ? 'HOLIDAY' : state.toUpperCase()

  return (
    <header class="flex items-center gap-3 px-3 h-9 shrink-0 bg-surface-1 border-b border-line font-mono text-[11px]">
      <a href="#/" class="font-bold text-accent tracking-tight text-[13px] hover:no-underline">ticker-tape</a>

      <span
        class={`px-1.5 py-px rounded border text-[10px] font-bold tracking-wider whitespace-nowrap ${STATE_CHIP[holiday ? 'closed' : state]}`}
        title={holiday || undefined}
      >
        {tl(chipLabel)}
      </span>

      <div class="flex-1 flex items-center gap-4 overflow-x-auto min-w-0 no-scrollbar">
        {strip.map(({ symbol, label }) => {
          const q = quotes[symbol]?.quote
          const up = (q?.pct ?? 0) >= 0
          const isVix = symbol === '^VIX'
          return (
            <span key={symbol} class="flex items-baseline gap-1.5 whitespace-nowrap">
              <span class="text-muted">{tl(label)}</span>
              <span class={isVix ? vixClass(q?.price) : 'text-ink-2'}>{q ? fmtPrice(q.price) : '—'}</span>
              {q && !isVix && <span class={up ? 'text-up' : 'text-down'}>{fmtPct(q.pct)}</span>}
            </span>
          )
        })}
      </div>

      <span class="text-ink-2 whitespace-nowrap flex items-center gap-1.5">
        {clock} ET
        <span
          class={`inline-block w-1.5 h-1.5 rounded-full ${online ? 'bg-up' : 'bg-down'}`}
          title={online ? 'online' : 'offline'}
        />
      </span>
      <button
        onClick={() => setLocale(getLocale() === 'en' ? 'zh' : 'en')}
        class="px-1.5 py-0.5 rounded border border-line text-muted hover:text-ink hover:border-line-2"
        title="EN / 中文"
      >
        {getLocale() === 'en' ? '中' : 'EN'}
      </button>
    </header>
  )
}
