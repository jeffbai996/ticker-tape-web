// Additional dashboard watchlists. The canonical watchlist remains in
// watchlist.js because Briefing, Wire, chat tools, and the global ticker tape
// all intentionally share it. These lists are alternate dashboard lenses.

import { moveInList } from './watchorder.js'

const KEY = 'named_watchlists_v1'
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/
const MAX_SYMBOLS = 60
const MAX_NAME = 32
const listeners = new Set()

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME)
}

function cleanSymbols(symbols) {
  return [...new Set((symbols || [])
    .map((s) => String(s || '').trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s)))]
    .slice(0, MAX_SYMBOLS)
}

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'watchlist'
}

export function loadWatchlists() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY))
    if (!Array.isArray(raw)) return []
    const ids = new Set()
    return raw.flatMap((item) => {
      const name = cleanName(item?.name)
      const id = String(item?.id || '').toLowerCase()
      if (!name || !/^[a-z0-9-]{1,40}$/.test(id) || ids.has(id)) return []
      ids.add(id)
      return [{ id, name, symbols: cleanSymbols(item.symbols) }]
    })
  } catch { return [] }
}

function persist(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)) } catch { /* best-effort */ }
  for (const fn of listeners) fn(items)
}

export function onWatchlistsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function getWatchlistById(id) {
  return loadWatchlists().find((item) => item.id === id) || null
}

/** Bulk replace from the cloud-sync merge — runs through the same cleaning
 *  as loadWatchlists so a hostile remote document can't smuggle junk in. */
export function replaceWatchlists(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items || [])) } catch { /* best-effort */ }
  const clean = loadWatchlists()
  persist(clean)
  return clean
}

export function createWatchlist(value, symbols = []) {
  const name = cleanName(value)
  if (!name) return null
  const items = loadWatchlists()
  if (items.some((item) => item.name.toLowerCase() === name.toLowerCase())) return null
  const base = slugify(name)
  let id = base
  let suffix = 2
  while (items.some((item) => item.id === id)) id = `${base}-${suffix++}`
  const item = { id, name, symbols: cleanSymbols(symbols) }
  persist([...items, item])
  return item
}

export function renameWatchlist(id, value) {
  const name = cleanName(value)
  const items = loadWatchlists()
  const index = items.findIndex((item) => item.id === id)
  if (!name || index < 0) return null
  if (items.some((item, i) => i !== index && item.name.toLowerCase() === name.toLowerCase())) return null
  items[index] = { ...items[index], name }
  persist(items)
  return items[index]
}

export function removeWatchlist(id) {
  const items = loadWatchlists()
  if (!items.some((item) => item.id === id)) return false
  persist(items.filter((item) => item.id !== id))
  return true
}

function updateSymbols(id, mutate) {
  const items = loadWatchlists()
  const index = items.findIndex((item) => item.id === id)
  if (index < 0) return null
  const next = cleanSymbols(mutate(items[index].symbols))
  items[index] = { ...items[index], symbols: next }
  persist(items)
  return next
}

export function addWatchlistSymbol(id, value) {
  const symbol = String(value || '').trim().toUpperCase()
  if (!SYMBOL_RE.test(symbol)) return null
  const item = getWatchlistById(id)
  if (!item || item.symbols.includes(symbol) || item.symbols.length >= MAX_SYMBOLS) return null
  return updateSymbols(id, (symbols) => [...symbols, symbol])
}

export function moveWatchlistSymbol(id, symbol, where) {
  return updateSymbols(id, (symbols) => moveInList(symbols, symbol, where))
}

export function removeWatchlistSymbol(id, value) {
  const symbol = String(value || '').trim().toUpperCase()
  const item = getWatchlistById(id)
  if (!item || !item.symbols.includes(symbol)) return null
  return updateSymbols(id, (symbols) => symbols.filter((s) => s !== symbol))
}

