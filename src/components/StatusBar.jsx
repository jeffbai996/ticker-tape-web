import { useEffect, useRef, useState } from 'preact/hooks'
import { useQuotes } from '../hooks.js'
import { INDICES } from '../lib/symbols.js'
import { marketState } from '../lib/marketState.js'
import { paintRollingTime, stopRollingTime, CLOCK_ZONES } from '../lib/rollclock.js'
import { startVisibleClock } from '../lib/idleClock.js'
import { hrefFor } from '../lib/route.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { FlashPrice } from './Fig.jsx'
import { FeedIndicator } from './FeedIndicator.jsx'
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
// single-character session states for the zh reader (Jeff 2026-08-05)
const COMPACT_STATE_LABEL_ZH = { open: '开', pre: '前', post: '后', closed: '休', holiday: '休' }

// Outside regular hours the cash indices freeze — swap in the 24h futures
// contracts, exactly like the TUI status bar does.
const FUTURES_SWAP = {
  '^GSPC': { symbol: 'ES=F', label: 'ES' },
  '^IXIC': { symbol: 'NQ=F', label: 'NQ' },
  '^DJI': { symbol: 'YM=F', label: 'YM' },
}

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
    // This clock sits in the shell, so it is the one timer that runs on every
    // route: 1 Hz of DOM writes plus a forced reflow per rolling digit, for a
    // face nobody can read while the tab is buried. Aligned to the second so
    // the painted value is never a beat stale, and off entirely while hidden.
    const stop = startVisibleClock(1000, paint)
    return () => {
      stop()
      stopRollingTime(desktopClock.current)
      stopRollingTime(mobileClock.current)
    }
  }, [zi])
  const cycle = () => {
    const n = (zi + 1) % CLOCK_ZONES.length
    setZi(n)
    localStorage.setItem('tape-clock-tz', CLOCK_ZONES[n].id)
  }
  return (
    <button
      onClick={cycle}
      /* Clicking this cycles the timezone, so it keeps a real edge at rest.
          It deliberately does not use the lifted board-control treatment:
          this is status chrome, not a dashboard action. An explicit 20px
          height matches the locale and market-state pills; only colour changes
          on hover/focus, so the 32px header never shifts.
          Padding is even. The old phone-only `pr-0` made the online dot look
          off-centre once the clock gained a border (Jeff 2026-08-06).
          `ml-1` is the clock's own gap: the index strip on its left is a
          scroll container whose last cell can end flush at the edge, and the
          feed chip that used to sit between them shows nothing while the
          feed is healthy. */
      title={tl('cycle timezone')}
      data-status-clock
      class="h-5 group flex cursor-pointer items-center gap-1 whitespace-nowrap font-anth px-1 py-0 rounded border border-transparent transition-colors duration-200 hover:border-line-2 hover:bg-white/[0.045] focus-visible:border-line-2 focus-visible:bg-white/[0.045] focus-visible:outline-none"
    >
      {/* Anthropic Sans digits (Jeff 2026-08-06) — falls back to Jakarta on
          the public build, where the licensing-gated woff2 never ships */}
      <span ref={desktopClock} class="max-md:hidden inline-flex items-baseline font-anth text-accent font-semibold text-[12px]" />
      <span ref={mobileClock} class="md:hidden inline-flex items-baseline font-anth text-accent font-semibold text-[12px]" />
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
       class="hl-row flex items-baseline gap-1.5 whitespace-nowrap leading-5 px-0.5 hover:no-underline">
      <span class="text-muted/60 font-tick text-[10px]">
        {label === 'S&P 500' ? (
          <><span class="md:hidden">S&P</span><span class="max-md:hidden">{tl(label)}</span></>
        ) : tl(label)}
      </span>
      {/* no thousands separators in the strip — "29536.50" scans faster at a
          glance than "29,536.50" in a 10px ribbon (Jeff 2026-08-06); commas
          stay everywhere else */}
      {/* Flash restored 2026-08-11: stripped as a shimmer suspect, exonerated
          when the dither re-roll on .board-control turned out to be the whole
          story. Futures + BTC blinking overnight is the strip doing its job. */}
      <span class={`font-semibold ${isVix ? vixClass(q?.price) : 'text-ink-2'}`}>{q ? <FlashPrice price={q.price} fmt={(v) => fmtPrice(v).replace(/,/g, '')} /> : '—'}</span>
      {q && !isVix && <span class={`text-[10px] ${up ? 'text-up' : 'text-down'}`}>{fmtPct(q.pct)}</span>}
    </a>
  )
}

export function StatusBar() {
  const [now, setNow] = useState(() => new Date())
  const online = useOnline()
  const stripRef = useRef(null)
  // edge-scroll (creep toward the hovered side) removed outright — on touch a
  // tap triggered it and it fought the native swipe (Jeff 2026-08-06)

  useEffect(() => {
    // 30s, not 1s: `now` only feeds the session chip + countdown title, and a
    // per-second re-render of the whole bar was one of the 1Hz layout pokes
    // behind the zh-zoom shimmer (Jeff 2026-08-11). The clock paints itself.
    // Hidden tabs skip it outright — the session chip is recomputed on the
    // way back, before the reader has had time to look at it.
    return startVisibleClock(30_000, () => setNow(new Date()))
  }, [])

  const { state, holiday } = marketState(now)
  const strip = INDICES.map((i) =>
    state !== 'open' && FUTURES_SWAP[i.symbol] ? FUTURES_SWAP[i.symbol] : i)
  const quotes = useQuotes(strip.map((i) => i.symbol))
  // "PM" reads as afternoon, not premarket — the chip says PRE; and POST, not
  // AH, to match the session-state family OPEN/CLOSED/POST/PRE (Jeff 2026-08-06)
  const chipLabel = holiday ? 'HOLIDAY' : state === 'pre' ? 'PRE' : state === 'post' ? 'POST' : state.toUpperCase()
  const compactChipLabel = (getLocale() === 'zh' ? COMPACT_STATE_LABEL_ZH : COMPACT_STATE_LABEL)[holiday ? 'holiday' : state]
  // "session closes in 2h 14m" on hover — ET boundary walk, DST via Intl
  const etParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(now)
  const etMins = Number(etParts.find((p) => p.type === 'hour').value) % 24 * 60
    + Number(etParts.find((p) => p.type === 'minute').value)
  // {t} pattern keys: zh needs the countdown in a different position than
  // "<event> in 2h 14m", so the whole sentence is the label and tl's
  // fall-back-to-key keeps English working until the entry lands
  const EDGES = [[240, 'pre-market opens in {t}'], [570, 'session opens in {t}'],
    [960, 'session closes in {t}'], [1200, 'after-hours ends in {t}']]
  const edge = EDGES.find(([m]) => etMins < m)
  const chipTitle = holiday ? tl(holiday)
    : edge ? tl(edge[1]).replace('{t}',
      `${Math.floor((edge[0] - etMins) / 60)}h ${(edge[0] - etMins) % 60}m`)
    : tl('next session monday')

  return (
    <header class="flex items-center gap-3 max-md:gap-1.5 px-3 max-md:px-2 h-8 shrink-0 bg-black border-b border-line font-mono text-[11px] select-none">
      {/* the wordmark is a link home and never looked like one — it now lights
          up (amber wash + rule) under the pointer (Jeff 2026-08-04) */}
      {/* the logo is the resting brand; the wordmark unfolds from behind it
          on hover and everything to its right (the status chip first) glides
          over as the width animates (Jeff 2026-08-06) */}
      <a
        href="#/"
        title={tl('Dashboard')}
        class="brand-morph flex items-center -mx-1 px-1 py-0.5 rounded border border-transparent
               hover:no-underline hover:bg-accent-soft hover:border-accent/40 transition-colors"
      >
        <img src={`${import.meta.env.BASE_URL}ticker-tape-mark.svg`} alt="ticker-tape" class="w-5 h-5 shrink-0" />
        <span class="brand-word max-md:hidden font-bold text-accent tracking-tight text-[13px]">ticker-tape</span>
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
        <div ref={stripRef} class="w-full flex items-baseline gap-[5px] overflow-x-auto no-scrollbar py-0.5">
          {strip.map(({ symbol, label }) => (
            <StripCell key={symbol} symbol={symbol} label={label} q={quotes[symbol]?.quote} />
          ))}
        </div>
      </div>

      {/* feed health sits with the other truth-about-the-connection chrome:
          clock, feed state, browser online dot — one line, never a new row */}
      <FeedIndicator />
      <span class="flex items-center gap-1.5 shrink-0 md:-ml-1">
        <RollingClock />
        <span
          class={`inline-block w-1.5 h-1.5 rounded-full ${online ? 'bg-up' : 'bg-down'}`}
          title={online ? tl('online') : tl('offline')}
        />
        <button
          onClick={() => setLocale(getLocale() === 'en' ? 'zh' : 'en')}
          title="EN / 中文"
          data-status-locale
          class="h-5 inline-flex items-center px-1 py-0 rounded border border-line text-muted hover:text-ink hover:border-line-2"
        >
          {getLocale() === 'en' ? '中' : 'EN'}
        </button>
      </span>
    </header>
  )
}
