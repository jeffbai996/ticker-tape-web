/**
 * Quote consumers are scoped to mounted UI surfaces. The newest surface is
 * ordered first so a just-opened custom watchlist leads the stream request,
 * while persistent consumers (alerts) remain subscribed behind it.
 *
 * On top of that a surface can declare a FOCUS set — the subset of its tracked
 * symbols the user is actually looking at (the rows in the viewport, the open
 * research symbol). Focus never changes membership, only order and priority:
 * this module decides the ordering, feed.js spends the request budget.
 */

/** A focus set is one v7 request. Past that it stops being a focus set, so a
 *  surface that declares its whole board gets the first chunk, not a queue. */
export const FOCUS_MAX = 40

/** Focused symbols first (in focus order), everything else in its original
 *  order. Focus entries that aren't in `symbols` are ignored — an unmounted
 *  surface can't reorder a board it no longer contributes to. */
export function orderFocusedFirst(symbols, focused) {
  const all = [...new Set((symbols || []).filter(Boolean))]
  if (!focused?.length) return all
  const present = new Set(all)
  const head = []
  const taken = new Set()
  for (const symbol of focused) {
    if (!present.has(symbol) || taken.has(symbol)) continue
    taken.add(symbol)
    head.push(symbol)
  }
  if (!head.length) return all
  return [...head, ...all.filter((symbol) => !taken.has(symbol))]
}

/**
 * Which entry the per-symbol chart pump should take next: the first queued
 * symbol that is on screen, otherwise the head of the queue (the pre-focus
 * behaviour, unchanged). `pinned` is honoured only at the head — the RS
 * benchmark is prepended so badge rows have something to diff against, and
 * jumping it would paint the first visible rows with no RS at all.
 * Returns -1 for an empty queue.
 */
export function nextPumpIndex(queue, focused, pinned = null) {
  if (!queue?.length) return -1
  if (pinned && queue[0] === pinned) return 0
  const set = focused instanceof Set ? focused : new Set(focused || [])
  if (!set.size) return 0
  const i = queue.findIndex((symbol) => set.has(symbol))
  return i >= 0 ? i : 0
}

export function createFeedSymbolRegistry() {
  const consumers = new Map()
  const focusConsumers = new Map()
  const persistent = new Set()
  let nextId = 1

  const clean = (symbols) => [...new Set((symbols || []).filter(Boolean))]

  const register = (map, symbols) => {
    const id = nextId++
    map.set(id, clean(symbols))
    let active = true
    return () => {
      if (!active) return
      active = false
      map.delete(id)
    }
  }

  const base = () => {
    const out = []
    const seen = new Set()
    const active = [...consumers.values()].reverse()
    for (const symbols of active) {
      for (const symbol of symbols) {
        if (seen.has(symbol)) continue
        seen.add(symbol)
        out.push(symbol)
      }
    }
    for (const symbol of persistent) {
      if (seen.has(symbol)) continue
      seen.add(symbol)
      out.push(symbol)
    }
    return out
  }

  /** On-screen symbols, newest surface first, deduped and capped. Not
   *  intersected with the tracked set: a row can focus before its board's
   *  retain effect runs, and callers that need tracked-only filter at use
   *  time (where an unmounted surface has already dropped out). */
  const focused = () => {
    const out = []
    const seen = new Set()
    for (const symbols of [...focusConsumers.values()].reverse()) {
      for (const symbol of symbols) {
        if (seen.has(symbol)) continue
        seen.add(symbol)
        out.push(symbol)
        if (out.length >= FOCUS_MAX) return out
      }
    }
    return out
  }

  return {
    retain(symbols) {
      return register(consumers, symbols)
    },

    /** Declare the symbols on screen. Returns a release, like retain(). */
    focus(symbols) {
      return register(focusConsumers, symbols)
    },

    focused,

    persist(symbols) {
      for (const symbol of clean(symbols)) persistent.add(symbol)
    },

    values() {
      return orderFocusedFirst(base(), focused())
    },
  }
}
