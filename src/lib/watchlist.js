// User-editable watchlist (CLI `w SYM` / `uw SYM` parity). Persisted per
// browser; falls back to the generic default set. Symbols added here drive
// the sidebar rail, the tape, the dashboard's Custom bucket, and the heatmap.

import { WATCHLIST as DEFAULT_WATCHLIST } from './symbols.js'
import { moveInList } from './watchorder.js'

const KEY = 'watchlist_v1'
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/
const MAX = 60

const listeners = new Set()

export function onWatchlistChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

let cachedList = null

export function getWatchlist() {
  if (cachedList) return cachedList
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    if (Array.isArray(saved) && saved.length) return (cachedList = saved)
  } catch { /* fall through to default */ }
  return (cachedList = [...DEFAULT_WATCHLIST])
}

function save(list) {
  cachedList = list
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* best-effort */ }
  for (const fn of listeners) fn(list)
}

export function isWatched(symbol) {
  return getWatchlist().includes((symbol || '').toUpperCase())
}

/** Add a symbol. Returns the new list, or null if invalid/duplicate/full. */
/** Bulk replace from the cloud-sync merge — same validation as save(),
 *  same change event, no per-symbol ceremony. */
export function replaceWatchlist(list) {
  const clean = [...new Set((list || [])
    .map((s) => String(s || '').trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s)))].slice(0, MAX)
  cachedList = clean
  try { localStorage.setItem(KEY, JSON.stringify(clean)) } catch { /* best-effort */ }
  for (const fn of listeners) fn(clean)
  return clean
}

export function watch(symbol) {
  const sym = (symbol || '').trim().toUpperCase()
  if (!SYMBOL_RE.test(sym)) return null
  const list = getWatchlist()
  if (list.includes(sym) || list.length >= MAX) return null
  const next = [...list, sym]
  save(next)
  return next
}

/** Remove a symbol. Returns the new list, or null if it wasn't there. */
export function unwatch(symbol) {
  const sym = (symbol || '').trim().toUpperCase()
  const list = getWatchlist()
  if (!list.includes(sym)) return null
  const next = list.filter((s) => s !== sym)
  save(next)
  return next
}

/** Nudge a symbol by ±1 (reorder arrows). */
export function moveSymbol(symbol, delta) {
  const next = moveInList(getWatchlist(), (symbol || '').toUpperCase(), delta)
  save(next)
  return next
}

/** Drop `symbol` into `before`'s slot (drag & drop landing). */
export function placeSymbol(symbol, before) {
  const next = moveInList(getWatchlist(), (symbol || '').toUpperCase(),
                          { before: (before || '').toUpperCase() })
  save(next)
  return next
}
