// User-editable watchlist (CLI `w SYM` / `uw SYM` parity). Persisted per
// browser; falls back to the generic default set. Symbols added here drive
// the sidebar rail, the tape, the dashboard's Custom bucket, and the heatmap.

import { WATCHLIST as DEFAULT_WATCHLIST } from './symbols.js'

const KEY = 'watchlist_v1'
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/
const MAX = 60

const listeners = new Set()

export function onWatchlistChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    if (Array.isArray(saved) && saved.length) return saved
  } catch { /* fall through to default */ }
  return [...DEFAULT_WATCHLIST]
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch { /* best-effort */ }
  for (const fn of listeners) fn(list)
}

export function isWatched(symbol) {
  return getWatchlist().includes((symbol || '').toUpperCase())
}

/** Add a symbol. Returns the new list, or null if invalid/duplicate/full. */
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
