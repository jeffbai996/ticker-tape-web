import { useEffect, useRef, useState } from 'preact/hooks'
import { useQuotes } from '../hooks.js'
import { INDICES } from '../lib/symbols.js'
import { marketState } from '../lib/marketState.js'
import { paintRollingTime, CLOCK_ZONES } from '../lib/rollclock.js'
import { FlashPrice } from './Fig.jsx'
import { hrefFor } from '../lib/route.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { tl, getLocale, setLocale } from '../lib/i18n.js'

// Session-state chip styling mirrors the extended-quote grammar: blue PM and
// purple AH. Green/red remain reserved for open/closed state.
const STATE_CHIP = {
  open: 'text-up border-up/50 bg-up/10',
  pre: 'text-[#5ba8d9] border-[#5ba8d9]/50 bg-[#5ba8d9]/10',
  post: 'text-[#c084fc] border-[#c084fc]/50 bg-[#c084fc]/10',
  closed: 'text-down border-down/50 bg-down/10',
}
const COMPACT_STATE_LABEL = { open: 'O', pre: 'P', post: 'A', closed: 'C', holiday: 'H' }

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

/**
 * Edge-hover auto-scroll for a horizontally scrollable strip: the closer the
 * pointer sits to an edge, the faster it creeps that way. Trackpad and drag
 * scrolling keep working on their own; this is for mouse users with no
 * horizontal wheel.
 */
function useEdgeScroll(ref, zone = 70, maxSpeed = 9) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    let speed = 0
    const step = () => {
      raf = speed ? requestAnimationFrame(step) : 0
      if (speed) el.scrollLeft += speed
    }
    const move = (e) => {
      const r = el.getBoundingClientRect()
      const fromRight = r.right - e.clientX
      const fromLeft = e.clientX - r.left
      if (fromRight < zone) speed = ((zone - fromRight) / zone) * maxSpeed
      else if (fromLeft < zone) speed = -((zone - fromLeft) / zone) * maxSpeed
      else speed = 0
      if (speed && !raf) raf = requestAnimationFrame(step)
    }
    const stop = () => { speed = 0; cancelAnimationFrame(raf); raf = 0 }
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseleave', stop)
    return () => {
      el.removeEventListener('mousemove', move)
      el.removeEventListener('mouseleave', stop)
      cancelAnimationFrame(raf)
    }
  }, [ref, zone, maxSpeed])
}

// amber rolodex clock with a click-to-cycle timezone (ET → HKT → PT).
// IANA zone names mean DST is the platform's problem, not ours.
function RollingClock() {
  const desktopClock = useRef(null)
  const mobileClock = useRef(null)
  const [zi, setZi] = useState(() => {
    const saved = localStorage.getItem('tape-clock-tz')
    const i = CLOCK_ZONES.findIndex((z) => z.id === saved)
    return i >= 0 ? i : 0
  })
  useEffect(() => {
    const paint = () => {
      const value = new Date().toLocaleTimeString('en-US',
        { hour12: false, timeZone: CLOCK_ZONES[zi].id })
      if (desktopClock.current) paintRollingTime(desktopClock.current, value)
      if (mobileClock.current) paintRollingTime(mobileClock.current, value.slice(0, 5))
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
      class="flex items-baseline gap-1 whitespace-nowrap font-anth group px-1.5 py-0.5 rounded hover:bg-accent-soft hover:outline hover:outline-1 hover:outline-accent/50"
      title={tl('cycle timezone')}
    >
      <span ref={desktopClock} class="max-md:hidden inline-flex items-baseline text-accent font-semibold text-[12px]" />
      <span ref={mobileClock} class="md:hidden inline-flex items-baseline text-accent font-semibold text-[12px]" />
      <span class="text-[8.5px] tracking-wider text-muted group-hover:text-white hover:text-white transition-colors">
        {CLOCK_ZONES[zi].label}
      </span>
    </button>
  )
}

function StripCell({ symbol, label, q }) {
  const up = (q?.pct ?? 0) >= 0
  const isVix = symbol === '^VIX'
  return (
    <a href={hrefFor('research', symbol.toLowerCase())}
       class="hl-row flex items-baseline gap-[3px] whitespace-nowrap leading-5 px-1 hover:no-underline">
      <span class="text-muted/60 font-tick text-[10px]">{tl(label)}</span>
      <span class={`font-semibold ${isVix ? vixClass(q?.price) : 'text-ink-2'}`}>{q ? <FlashPrice price={q.price} fmt={fmtPrice} /> : '—'}</span>
      {q && !isVix && <span class={`text-[10px] ${up ? 'text-up' : 'text-down'}`}>{fmtPct(q.pct)}</span>}
    </a>
  )
}

export function StatusBar() {
  const [now, setNow] = useState(() => new Date())
  const online = useOnline()
  const stripRef = useRef(null)
  useEdgeScroll(stripRef)

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const { state, holiday } = marketState(now)
  const strip = INDICES.map((i) =>
    state !== 'open' && FUTURES_SWAP[i.symbol] ? FUTURES_SWAP[i.symbol] : i)
  const quotes = useQuotes(strip.map((i) => i.symbol))
  const chipLabel = holiday ? 'HOLIDAY' : state === 'pre' ? 'PM' : state === 'post' ? 'AH' : state.toUpperCase()
  const compactChipLabel = COMPACT_STATE_LABEL[holiday ? 'holiday' : state]
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
    <header class="flex items-center gap-3 max-md:gap-1.5 px-3 max-md:px-2 h-8 shrink-0 bg-black border-b border-line font-mono text-[11px] select-none">
      {/* the wordmark is a link home and never looked like one — it now lights
          up (amber wash + rule) under the pointer (Jeff 2026-08-04) */}
      <a
        href="#/"
        title={tl('Dashboard')}
        class="font-bold text-accent tracking-tight text-[13px] -mx-1 px-1 py-0.5 rounded border border-transparent
               hover:no-underline hover:bg-accent-soft hover:border-accent/40 hover:text-accent transition-colors"
      >
        <img src={`${import.meta.env.BASE_URL}ticker-tape-mark.svg`} alt="" class="md:hidden w-5 h-5" />
        <span class="max-md:hidden">ticker-tape</span>
      </a>

      <span
        class={`px-1.5 max-md:px-0 py-px max-md:w-5 max-md:h-5 max-md:grid max-md:place-items-center rounded border text-[10px] font-anth font-bold tracking-wider max-md:tracking-normal whitespace-nowrap ${STATE_CHIP[holiday ? 'closed' : state]}`}
        title={chipTitle}
      >
        <span class="max-md:hidden">{tl(chipLabel)}</span>
        <span class="md:hidden">{compactChipLabel}</span>
      </span>

      {/* one scrollable line, centred in the bar so it lines up with the
          wordmark: swipe it, drag it, or hover an edge to creep along. */}
      <div class="flex-1 min-w-0 flex items-center">
        <div ref={stripRef} class="w-full flex items-baseline gap-0 overflow-x-auto no-scrollbar py-0.5">
          {strip.map(({ symbol, label }) => (
            <StripCell key={symbol} symbol={symbol} label={label} q={quotes[symbol]?.quote} />
          ))}
        </div>
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
