import { useEffect, useRef, useState } from 'preact/hooks'
import { useQuotes, useWatchlist, useTapeSymbols } from '../hooks.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { FlashPrice } from './Fig.jsx'
import { hrefFor } from '../lib/route.js'
import { marqueeCopies } from '../lib/marquee.js'
import { REDUCED_MOTION, tapeBadge, tapeEntries, tapePlayState } from '../lib/tape.js'
import { startVisibleClock } from '../lib/idleClock.js'
import { tapeworthy, wireUrl, evHeadline } from '../lib/wire.js'
import { getLocale } from '../lib/i18n.js'
import { extendedLabelClass } from '../lib/extendedHours.js'
import { prefetchSymbol } from '../lib/history.js'

// The namesake: a continuously scrolling quote marquee. The list is doubled
// so the -50% keyframe loops seamlessly.
//
// Highlighting a moving belt can't be done with :hover. The browser only
// re-runs hit testing when a pointer event fires, so on a belt that scrolls
// under a still cursor the hover state latches onto whatever item was there
// at the last mousemove and then rides away with it — the highlight ends up
// somewhere the cursor isn't. Tracking the pointer on every frame and asking
// what's under it puts the highlight where the user is actually looking, and
// the belt never has to stop (Jeff 2026-08-03).
//
// The per-frame hit test is only needed because the belt moves. When it is
// parked — reduced motion, or a hidden tab — the item under the cursor can
// only change when the cursor does, so the loop is dropped and the same work
// happens on mousemove instead. Same highlight, none of the idle frames.
function usePointerHighlight(ref, moving) {
  useEffect(() => {
    const wrap = ref.current
    if (!wrap) return
    let raf = 0
    let pos = null
    let lit = null

    const clear = () => {
      if (lit) lit.classList.remove('tape-hot')
      lit = null
    }
    const hit = () => {
      if (!pos) return
      const under = document.elementFromPoint(pos.x, pos.y)
      const item = under?.closest?.('[data-tape-item]')
      const next = item && wrap.contains(item) ? item : null
      if (next === lit) return
      clear()
      if (next) {
        next.classList.add('tape-hot')
        lit = next
      }
    }
    const frame = () => {
      raf = requestAnimationFrame(frame)
      hit()
    }
    const move = (e) => {
      pos = { x: e.clientX, y: e.clientY }
      if (!moving) { hit(); return }
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const leave = () => {
      pos = null
      cancelAnimationFrame(raf)
      raf = 0
      clear()
    }

    wrap.addEventListener('mousemove', move)
    wrap.addEventListener('mouseleave', leave)
    return () => {
      wrap.removeEventListener('mousemove', move)
      wrap.removeEventListener('mouseleave', leave)
      cancelAnimationFrame(raf)
      clear()
    }
  }, [ref, moving])
}

/**
 * `animation-play-state` for the belt, kept in sync with tab visibility and
 * the reduced-motion setting. Both are listened to rather than read once —
 * the reader can bury the tab or flip the OS setting at any point.
 */
export function useTapeMotion() {
  const [play, setPlay] = useState('running')
  useEffect(() => {
    const mq = globalThis.matchMedia?.(REDUCED_MOTION)
    const sync = () => setPlay(tapePlayState({
      hidden: document.hidden,
      reducedMotion: !!mq?.matches,
    }))
    sync()
    document.addEventListener('visibilitychange', sync)
    mq?.addEventListener?.('change', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      mq?.removeEventListener?.('change', sync)
    }
  }, [])
  return play
}

/**
 * Breaking headlines off the user's own fragwire, spliced into the belt. Only
 * runs when they've pointed the app at an endpoint; the public build never
 * calls anything. Refreshes on the same cadence as the wire panel.
 */
function useWireHeadlines() {
  const [rows, setRows] = useState([])
  useEffect(() => {
    const base = wireUrl()
    if (!base) return
    let dead = false
    const pull = () => {
      fetch(`${base.replace(/\/$/, '')}/api/events?limit=60&newest=1`,
            { signal: AbortSignal.timeout(8000) })
        .then((r) => r.json())
        .then((out) => { if (!dead) setRows(tapeworthy(out.events || [])) })
        .catch(() => {})
    }
    pull()
    // Nothing on a hidden tab reads these headlines, so the poll stops with
    // it and takes one catch-up read on the way back.
    const stop = startVisibleClock(60_000, pull)
    return () => { dead = true; stop() }
  }, [])
  return rows
}

// The category, not a blanket WIRE stamp — an ERN pill and a FED pill read
// differently at a glance (Jeff 2026-08-04).

export function Tape() {
  const watchlist = useTapeSymbols()
  const quotes = useQuotes(watchlist)
  const heads = useWireHeadlines()
  const watchset = new Set(watchlist)
  const items = watchlist.map((s) => ({ symbol: s, q: quotes[s]?.quote }))
  const entries = tapeEntries(heads, items)
  const wrap = useRef(null)
  const firstCycle = useRef(null)
  const [marquee, setMarquee] = useState({ copies: 2, width: 0 })
  const play = useTapeMotion()
  usePointerHighlight(wrap, play === 'running')

  useEffect(() => {
    const viewport = wrap.current
    const cycle = firstCycle.current
    if (!viewport || !cycle) return

    const measure = () => {
      // getBoundingClientRect returns VISUAL px, but the keyframe translates
      // in the element's own layout px — under the zh locale's `zoom` those
      // differ, and the unscaled mismatch made the loop jump and clip
      // (Jeff 2026-08-09: "getting clipping in the scrolling ticker")
      const zoom = Number(getComputedStyle(document.documentElement).zoom) || 1
      const width = Math.ceil(cycle.getBoundingClientRect().width / zoom)
      const copies = marqueeCopies(viewport.clientWidth, width)
      setMarquee((current) => current.width === width && current.copies === copies
        ? current
        : { width, copies })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    observer.observe(cycle)
    return () => observer.disconnect()
  }, [entries.length])

  const duration = Math.max(8, marquee.width / 82)

  return (
    <div ref={wrap} class="h-6 shrink-0 bg-black border-b border-line overflow-hidden relative">
      <div
        class={`tape-scroll flex h-full w-max font-mono text-[11px] ${marquee.width ? 'tape-scroll-ready' : ''}`}
        style={marquee.width ? {
          '--tape-cycle-width': `${marquee.width}px`,
          '--tape-cycle-duration': `${duration}s`,
          animationPlayState: play,
        } : undefined}
      >
        {Array.from({ length: marquee.copies }, (_, copy) => (
          <div ref={copy === 0 ? firstCycle : undefined} key={copy} class="tape-cycle flex items-center h-full gap-1.5 pr-3">
            {entries.map(({ kind, data }, i) => {
              if (kind === 'headline') {
                const e = data
                return (
                  <a
                    key={`h-${e.id}-${i}`}
                    data-tape-item
                    // the story itself, not the symbol's page and not the top
                    // of the wire (Jeff 2026-08-05)
                    href={`#/wire/${e.id}`}
                    class="flex items-baseline gap-2 whitespace-nowrap hover:no-underline px-1 py-0.5"
                    title={evHeadline(e, getLocale())}
                  >
                    <span class={`text-[9px] font-bold tracking-wider px-1 rounded-sm ${tapeBadge(e, watchset).cls}`}>
                      {tapeBadge(e, watchset).code}
                    </span>
                    {/* it's a SCROLLING tape — a longer headline costs nothing but scroll
                        time, and 46ch cut stories off before the point landed (Jeff
                        2026-08-06: "cant really get the point sometimes") */}
                    <span class="text-accent font-semibold max-w-[110ch] truncate">{evHeadline(e, getLocale())}</span>
                  </a>
                )
              }

              const { symbol, q } = data
              const up = (q?.pct ?? 0) >= 0
              return (
                <a
                  key={`q-${symbol}-${i}`}
                  data-tape-item
                  href={hrefFor('research', symbol.toLowerCase())}
                  onMouseEnter={() => prefetchSymbol(symbol)}
                  class="flex items-baseline gap-1.5 whitespace-nowrap hover:no-underline px-1 py-0.5"
                >
                  {/* Flash restored 2026-08-11: the belt was de-flashed as a
                      shimmer suspect, but the real culprit was the dither
                      re-roll on .board-control (fixed via layer promotion) —
                      and a tape that never blinks reads dead. */}
                  <span class="text-ink font-bold font-tick text-[10px]">{symbol}</span>
                  <span class="text-[11px] text-ink-2 font-semibold">{q ? <FlashPrice price={q.price} fmt={fmtPrice} /> : '—'}</span>
                  <span class={`text-[10px] ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
                    {q ? fmtPct(q.pct) : '—'}
                  </span>
                  {/* the % glyph carries almost no right side bearing, so an
                      equal gap reads tighter on the label's left than its
                      right — the extra padding buys back the difference */}
                  {q?.extLabel && q.extPrice != null && (
                    <span class="inline-flex items-baseline gap-1.5 text-[10px] pl-[3px]">
                      <span class={`${extendedLabelClass(q.extLabel)} font-bold`}>{q.extLabel}</span>
                      <span class="text-ink-2 font-semibold"><FlashPrice price={q.extPrice} fmt={fmtPrice} /></span>
                    </span>
                  )}
                </a>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
