import { useEffect, useState } from 'preact/hooks'
import { useQuotes } from '../hooks.js'
import { INDICES } from '../lib/symbols.js'
import { marketState } from '../lib/marketState.js'
import { useRef } from 'preact/hooks'
import { paintRollingTime, CLOCK_ZONES } from '../lib/rollclock.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { tl, getLocale, setLocale } from '../lib/i18n.js'

// Session-state chip styling — mirrors the TUI's --open/--pre/--post/--closed
// status classes. Post-market shares the purple used for AH quotes.
const STATE_CHIP = {
  open: 'text-up border-up/50 bg-up/10',
  pre: 'text-[#c864ff] border-[#c864ff]/50 bg-[#c864ff]/10',
  post: 'text-[#5ba8d9] border-[#5ba8d9]/50 bg-[#5ba8d9]/10',
  closed: 'text-down border-down/50 bg-down/10',
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

// amber rolodex clock with a click-to-cycle timezone (ET → HKT → PT).
// IANA zone names mean DST is the platform's problem, not ours.
function RollingClock() {
  const el = useRef(null)
  const [zi, setZi] = useState(() => {
    const saved = localStorage.getItem('tape-clock-tz')
    const i = CLOCK_ZONES.findIndex((z) => z.id === saved)
    return i >= 0 ? i : 0
  })
  useEffect(() => {
    const paint = () => {
      if (el.current) {
        paintRollingTime(el.current, new Date().toLocaleTimeString('en-US',
          { hour12: false, timeZone: CLOCK_ZONES[zi].id }))
      }
    }
    paint()
    const t = setInterval(paint, 1000)
    return () => clearInterval(t)
  }, [zi])
  const cycle = () => {
    const n = (zi + 1) % CLOCK_ZONES.length
    setZi(n)
    localStorage.setItem('tape-clock-tz', CLOCK_ZONES[n].id)
  }
  return (
    <button
      onClick={cycle}
      class="flex items-baseline gap-1 whitespace-nowrap font-mono group"
      title="cycle timezone (ET → HKT → PT)"
    >
      <span ref={el} class="inline-flex items-baseline text-accent font-semibold text-[12px]" />
      <span class="text-[8.5px] tracking-wider text-muted group-hover:text-white">
        {CLOCK_ZONES[zi].label}
      </span>
    </button>
  )
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
  const chipLabel = holiday ? 'HOLIDAY' : state.toUpperCase()
  // "session closes in 2h 14m" on hover — ET boundary walk, DST via Intl
  const etParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
  const etMins = Number(etParts.find((p) => p.type === 'hour').value) % 24 * 60
    + Number(etParts.find((p) => p.type === 'minute').value)
  const EDGES = [[240, 'pre-market opens'], [570, 'session opens'], [960, 'session closes'], [1200, 'after-hours ends']]
  const edge = EDGES.find(([m]) => etMins < m)
  const chipTitle = holiday ? holiday
    : edge ? `${edge[1]} in ${Math.floor((edge[0] - etMins) / 60)}h ${(edge[0] - etMins) % 60}m`
    : 'next session monday'

  return (
    <header class="flex items-center gap-3 px-3 h-9 shrink-0 bg-surface-1 border-b border-line font-mono text-[11px] select-none">
      <a href="#/" class="font-bold text-accent tracking-tight text-[13px] hover:no-underline hover:text-ink transition-colors">ticker-tape</a>

      <span
        class={`px-1.5 py-px rounded border text-[10px] font-sans font-bold tracking-wider whitespace-nowrap ${STATE_CHIP[holiday ? 'closed' : state]}`}
        title={chipTitle}
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

      <RollingClock />
      <span
        class={`inline-block w-1.5 h-1.5 rounded-full ${online ? 'bg-up' : 'bg-down'}`}
        title={online ? 'online' : 'offline'}
      />
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
