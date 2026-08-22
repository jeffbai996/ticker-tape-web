// Which named watchlists also ride the scrolling tape up top. The main
// watchlist always does; a named list opts in per device (Jeff 2026-08-22:
// "a toggle for whether to include that watchlist's tickers in the
// scrolling ticker tape"). Local only: the synced watchlist document has a
// fixed shape, and which belts a reader wants scrolling is a device habit,
// not list content.
const KEY = 'tape_lists_v1'
const listeners = new Set()

export function tapeListIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

export function isTapeList(id) {
  return tapeListIds().includes(id)
}

export function toggleTapeList(id) {
  const cur = tapeListIds()
  const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* best-effort */ }
  for (const fn of [...listeners]) fn(next)
  return next
}

export function onTapeListsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The tape's symbol list: main first, then each opted-in list's symbols
 *  that main does not already carry, in list order. Pure. */
export function tapeSymbols(main, lists, ids) {
  const out = [...main]
  const seen = new Set(main)
  for (const id of ids) {
    const list = lists.find((l) => l.id === id)
    if (!list) continue
    for (const s of list.symbols) if (!seen.has(s)) { seen.add(s); out.push(s) }
  }
  return out
}
