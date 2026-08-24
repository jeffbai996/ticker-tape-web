// Which watchlists ride the scrolling tape up top. It is local only: the
// synced watchlist document has a fixed shape, while tape composition is a
// per-device reading preference.
const KEY = 'tape_lists_v1'
export const MAIN_TAPE_OFF = '__main_off__'
const listeners = new Set()

export function tapeListIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    return Array.isArray(raw) ? raw.filter((x) => typeof x === 'string') : []
  } catch { return [] }
}

export function isTapeList(id) {
  if (id === 'main') return !tapeListIds().includes(MAIN_TAPE_OFF)
  return tapeListIds().includes(id)
}

export function toggleTapeList(id) {
  const cur = tapeListIds()
  const target = id === 'main' ? MAIN_TAPE_OFF : id
  const next = cur.includes(target) ? cur.filter((x) => x !== target) : [...cur, target]
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* best-effort */ }
  for (const fn of [...listeners]) fn(next)
  return next
}

export function onTapeListsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** The tape's symbol list: the selected main list first, then each opted-in
 *  named list without duplicates, in list order. Pure. */
export function tapeSymbols(main, lists, ids) {
  const includeMain = !ids.includes(MAIN_TAPE_OFF)
  const out = includeMain ? [...main] : []
  const seen = new Set(out)
  for (const id of ids) {
    if (id === MAIN_TAPE_OFF) continue
    const list = lists.find((l) => l.id === id)
    if (!list) continue
    for (const s of list.symbols) if (!seen.has(s)) { seen.add(s); out.push(s) }
  }
  return out
}
