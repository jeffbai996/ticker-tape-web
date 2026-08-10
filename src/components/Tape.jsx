import { useEffect, useRef, useState } from 'preact/hooks'
import { useQuotes, useWatchlist } from '../hooks.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { hrefFor } from '../lib/route.js'
import { marqueeCopies } from '../lib/marquee.js'
import { tapeBadge, tapeEntries } from '../lib/tape.js'
import { tapeworthy, wireUrl } from '../lib/wire.js'
import { extendedLabelClass } from '../lib/extendedHours.js'

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
function usePointerHighlight(ref) {
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
    const frame = () => {
      raf = requestAnimationFrame(frame)
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
    const move = (e) => {
      pos = { x: e.clientX, y: e.clientY }
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
  }, [ref])
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
    const t = setInterval(pull, 60_000)
    return () => { dead = true; clearInterval(t) }
  }, [])
  return rows
}

// The category, not a blanket WIRE stamp — an ERN pill and a FED pill read
// differently at a glance (Jeff 2026-08-04).

export function Tape() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  const heads = useWireHeadlines()
  const watchset = new Set(watchlist)
  const items = watchlist.map((s) => ({ symbol: s, q: quotes[s]?.quote }))
  const entries = tapeEntries(heads, items)
  const wrap = useRef(null)
  const firstCycle = useRef(null)
  const [marquee, setMarquee] = useState({ copies: 2, width: 0 })
  usePointerHighlight(wrap)

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
                    title={e.headline}
                  >
                    <span class={`text-[9px] font-bold tracking-wider px-1 rounded-sm ${tapeBadge(e, watchset).cls}`}>
                      {tapeBadge(e, watchset).code}
                    </span>
                    {/* it's a SCROLLING tape — a longer headline costs nothing but scroll
                        time, and 46ch cut stories off before the point landed (Jeff
                        2026-08-06: "cant really get the point sometimes") */}
                    <span class="text-accent font-semibold max-w-[110ch] truncate">{e.headline}</span>
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
                  class="flex items-baseline gap-1.5 whitespace-nowrap hover:no-underline px-1 py-0.5"
                >
                  <span class="text-ink font-bold font-tick text-[10px]">{symbol}</span>
                  <span class="text-ink-2 font-semibold">{q ? fmtPrice(q.price) : '—'}</span>
                  <span class={`text-[10px] ${q ? (up ? 'text-up' : 'text-down') : 'text-muted'}`}>
                    {q ? fmtPct(q.pct) : '—'}
                  </span>
                  {/* the % glyph carries almost no right side bearing, so an
                      equal gap reads tighter on the label's left than its
                      right — the extra padding buys back the difference */}
                  {q?.extLabel && q.extPrice != null && (
                    <span class="inline-flex items-baseline gap-1.5 text-[10px] pl-[3px]">
                      <span class={`${extendedLabelClass(q.extLabel)} font-bold`}>{q.extLabel}</span>
                      <span class="text-ink-2 font-semibold">{fmtPrice(q.extPrice)}</span>
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
