import { useEffect, useRef } from 'preact/hooks'
import { useQuotes, useWatchlist } from '../hooks.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { hrefFor } from '../lib/route.js'

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

export function Tape() {
  const watchlist = useWatchlist()
  const quotes = useQuotes(watchlist)
  const items = watchlist.map((s) => ({ symbol: s, q: quotes[s]?.quote }))
  const wrap = useRef(null)
  usePointerHighlight(wrap)

  return (
    <div ref={wrap} class="h-7 shrink-0 bg-black border-b border-line overflow-hidden relative">
      <div class="tape-scroll flex items-center h-full gap-6 w-max font-mono text-[11px] pr-6">
        {[...items, ...items].map(({ symbol, q }, i) => {
          const up = (q?.pct ?? 0) >= 0
          return (
            <a
              key={`${symbol}-${i}`}
              data-tape-item
              href={hrefFor('research', symbol.toLowerCase())}
              class="flex items-baseline gap-1.5 whitespace-nowrap hover:no-underline px-1.5 -mx-1 py-0.5"
            >
              <span class="text-ink font-bold" style="font-family: 'Plus Jakarta Sans', sans-serif">{symbol}</span>
              <span class="text-ink-2 font-semibold">{q ? fmtPrice(q.price) : '—'}</span>
              {q && <span class={`text-[10px] ${up ? 'text-up' : 'text-down'}`}>{fmtPct(q.pct)}</span>}
            </a>
          )
        })}
      </div>
    </div>
  )
}
