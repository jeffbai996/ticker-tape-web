import { useEffect, useRef, useState } from 'preact/hooks'
import { useQuotes, useWatchlist } from '../hooks.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { hrefFor } from '../lib/route.js'
import { tapeworthy, wireUrl } from '../lib/wire.js'

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
const TAPE_CODE = {
  price_move: 'MOVE',
  earnings_release: 'ERN',
  filing: 'FIL',
  fed_headline: 'FED',
  fed_speech: 'FED',
  macro_print: 'MACRO',
  headline: 'NEWS',
  digest: 'AUDIO',
  transcript_chunk: 'AUDIO',
  brief: 'BRIEF',
}

export function Tape() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  const heads = useWireHeadlines()
  const items = watchlist.map((s) => ({ symbol: s, q: quotes[s]?.quote }))
  const wrap = useRef(null)
  usePointerHighlight(wrap)

  return (
    <div ref={wrap} class="h-7 shrink-0 bg-black border-b border-line overflow-hidden relative">
      <div class="tape-scroll flex items-center h-full gap-6 w-max font-mono text-[11px] pr-6">
        {[...heads, ...heads].map((e, i) => (
          <a
            key={`h-${e.id}-${i}`}
            data-tape-item
            href={e.symbols?.[0] ? hrefFor('research', e.symbols[0].toLowerCase()) : '#/wire'}
            class="flex items-baseline gap-2 whitespace-nowrap hover:no-underline px-1.5 -mx-1 py-0.5"
            title={e.headline}
          >
            <span class="text-[9px] font-bold tracking-wider text-black bg-accent px-1 rounded-sm">
              {TAPE_CODE[e.type] || 'WIRE'}
            </span>
            <span class="text-accent font-semibold max-w-[46ch] truncate">{e.headline}</span>
          </a>
        ))}
        {[...items, ...items].map(({ symbol, q }, i) => {
          const up = (q?.pct ?? 0) >= 0
          return (
            <a
              key={`${symbol}-${i}`}
              data-tape-item
              href={hrefFor('research', symbol.toLowerCase())}
              class="flex items-baseline gap-1.5 whitespace-nowrap hover:no-underline px-1.5 -mx-1 py-0.5"
            >
              <span class="text-ink font-bold font-tick text-[10px]">{symbol}</span>
              <span class="text-ink-2 font-semibold">{q ? fmtPrice(q.price) : '—'}</span>
              {q && <span class={`text-[10px] ${up ? 'text-up' : 'text-down'}`}>{fmtPct(q.pct)}</span>}
            </a>
          )
        })}
      </div>
    </div>
  )
}
