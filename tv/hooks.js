import { useEffect, useRef, useState } from 'preact/hooks'
import { feedStatus, focus, follow, getCached, subscribe } from '../src/lib/feed.js'
import { createQuoteRenderGate } from '../src/lib/quoteRenderGate.js'
import { fetchEvents, mirrorBase } from '../src/lib/wire.js'
import { pickHeadlines } from './lib/view.js'

// The web app's useQuotes lives in src/hooks.js beside alerts, locale and
// watchlist sync, none of which the TV runs. This is the same feed contract
// (follow + one coalesced render per frame) without importing those modules.
export function useQuotes(symbols) {
  const [, bump] = useState(0)
  const key = symbols.join(',')

  useEffect(() => {
    if (!symbols.length) return undefined
    const unfollow = follow(symbols)
    const wanted = new Set(symbols)
    const gate = createQuoteRenderGate({
      isHidden: () => document.hidden,
      scheduleFrame: (fn) => requestAnimationFrame(fn),
      cancelFrame: (id) => cancelAnimationFrame(id),
      // A TV's ARM cores repaint a full 1080p board slowly; four renders a
      // second keeps prices current without starving the remote's input.
      maxWaitMs: 250,
      render: () => bump((n) => n + 1),
    })
    const unsub = subscribe((symbol) => {
      if (wanted.has(symbol)) gate.onFeedUpdate()
    })
    const onVisibility = () => gate.onVisibilityChange()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      unfollow()
      unsub()
      document.removeEventListener('visibilitychange', onVisibility)
      gate.dispose()
    }
  }, [key])

  const out = {}
  for (const s of symbols) out[s] = getCached(s)
  return out
}

/** Rows on screen go first in the feed's batch and chart pump. */
export function useFocusedSymbols(symbols) {
  const key = symbols.filter(Boolean).join(',')
  useEffect(() => (key ? focus(key.split(',')) : undefined), [key])
}

/** Re-render on a fixed beat (clocks, feed health, headline ages). */
export function useNow(intervalMs) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export function useFeedStatus() {
  useNow(1000)
  return feedStatus()
}

const WIRE_REFRESH_MS = 120_000

/** Latest credible headlines from the public wire mirror. */
export function useHeadlines(limit) {
  const [events, setEvents] = useState([])
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const load = () => fetchEvents(mirrorBase(), { limit: 80, newest: true })
      .then((out) => { if (alive.current) setEvents(out?.events || []) })
      .catch(() => { /* keep the last good set; the next beat retries */ })
    load()
    const id = setInterval(load, WIRE_REFRESH_MS)
    return () => { alive.current = false; clearInterval(id) }
  }, [])
  return pickHeadlines(events, Date.now() / 1000, limit)
}
