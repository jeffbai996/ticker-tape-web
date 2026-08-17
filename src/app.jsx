import { useEffect, useRef, useState } from 'preact/hooks'
import { parseHash, hrefFor } from './lib/route.js'
import { NAV } from './lib/nav.js'
import { isTypingTarget } from './lib/keys.js'
import { conditionText } from './lib/alerts.js'
import { tl } from './lib/i18n.js'
import { useLocale } from './hooks.js'
import { useAlertEngine } from './hooks.js'
import { StatusBar } from './components/StatusBar.jsx'
import { Tape } from './components/Tape.jsx'
import { Sidebar } from './components/Sidebar.jsx'
import { BottomNav, SubTabs } from './components/BottomNav.jsx'
import { CommandBar } from './components/CommandBar.jsx'
import { Palette } from './components/Palette.jsx'
import { Page } from './pages/index.jsx'

function AlertToasts({ toasts, dismiss }) {
  if (!toasts.length) return null
  return (
    <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs">
      {toasts.map((t) => (
        <div key={t.id}
          class="rise-in bg-surface-2 border border-accent rounded-lg px-3 py-2 shadow-lg flex items-start gap-3">
          {/* the alert is about a symbol — the toast is the fastest route to it */}
          <a href={`#/research/${String(t.symbol || '').toLowerCase()}`}
            onClick={() => dismiss(t.id)}
            class="font-mono text-[11px] flex-1 min-w-0">
            <div class="text-accent font-bold text-[9px] uppercase tracking-wider pb-0.5">{tl('Alert triggered')}</div>
            <div class="text-ink">{conditionText(t)}</div>
            <div class="text-ink-2">now {Number(t.current).toFixed(2)}</div>
          </a>
          <button onClick={(e) => { e.stopPropagation(); dismiss(t.id) }}
            class="text-muted hover:text-ink font-mono text-[12px]">✕</button>
        </div>
      ))}
    </div>
  )
}

// Scroll offsets per hash. The shell has ONE scrolling element, so leaving a
// long page and coming back used to land at the top — the position is state
// the route doesn't carry. Bounded so a long session can't grow it forever.
const scrollTops = new Map()
const SCROLL_MAX = 50

function rememberScroll(key, top) {
  scrollTops.delete(key)          // re-insert so eviction drops the oldest READ
  scrollTops.set(key, top)
  if (scrollTops.size > SCROLL_MAX) scrollTops.delete(scrollTops.keys().next().value)
}

/** Save the scroll offset continuously, restore it after the route paints. */
function useScrollRestore(route, ref) {
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    let frame = 0
    let pending = null
    const onScroll = () => {
      // key and offset are read at event time: by the rAF the hash may
      // already be the NEXT route, which would file this page's offset
      // under the new one
      pending = [location.hash || '#/', el.scrollTop]
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        if (pending) rememberScroll(pending[0], pending[1])
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const key = location.hash || '#/'
    const frame = requestAnimationFrame(() => { el.scrollTop = scrollTops.get(key) || 0 })
    return () => cancelAnimationFrame(frame)
  }, [route.section, route.sub, route.view])
}

function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash))
    addEventListener('hashchange', onChange)
    // Safari standalone/PWA history controls can report a same-document back
    // traversal through popstate. Listen to both route signals; setting the
    // same parsed route twice is harmless, while missing popstate leaves the
    // old page painted under the new hash.
    addEventListener('popstate', onChange)
    return () => {
      removeEventListener('hashchange', onChange)
      removeEventListener('popstate', onChange)
    }
  }, [])
  return route
}

export function App() {
  const route = useHashRoute()
  const { toasts, dismiss } = useAlertEngine()
  useLocale() // locale toggle re-renders the whole shell
  const [paletteOpen, setPaletteOpen] = useState(false)
  const mainRef = useRef(null)
  useScrollRestore(route, mainRef)

  // Cmd/Ctrl+K owns the palette; `/` belongs to the command bar (it used to
  // open the palette too, so one keystroke did two things). Alt+1…9 jumps
  // straight to a nav section — undiscoverable by design, hinted in the
  // palette's empty state.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      } else if (e.altKey && !e.metaKey && !e.ctrlKey && /^[1-9]$/.test(e.key)) {
        if (isTypingTarget(document.activeElement)) return
        const section = NAV[Number(e.key) - 1]
        if (!section) return
        e.preventDefault()
        location.hash = hrefFor(section.id)
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <div class="h-dvh w-full max-w-full min-w-0 overflow-hidden flex flex-col bg-surface-0 text-ink font-sans antialiased">
      <StatusBar />
      <Tape />
      <SubTabs route={route} />
      <div class="flex-1 flex min-h-0">
        <Sidebar route={route} />
        <main ref={mainRef} class="flex-1 flex min-w-0 min-h-0 overflow-y-auto max-md:pb-12">
          <Page route={route} />
        </main>
      </div>
      <CommandBar />
      <BottomNav route={route} />
      <AlertToasts toasts={toasts} dismiss={dismiss} />
      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} />}
    </div>
  )
}
