// Capability-scoped watchlist sync for the public build. A capability is both
// the document address and its credential; this route exposes no listing,
// account, wire, chatstore, calendar, or portfolio surface.

import { CAPABILITY_RE, exactKeys, makeCapDocHandler, plainObject } from './capdoc.js'

const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/
const LIST_ID_RE = /^[a-z0-9-]{1,40}$/
const MAX_MAIN_SYMBOLS = 60
const MAX_NAMED_LISTS = 32
const MAX_LIST_SYMBOLS = 60
const MAX_NAME_CHARS = 32
const MAX_BODY_BYTES = 48_000

export function validWatchlistCapability(value) {
  return CAPABILITY_RE.test(String(value || ''))
}

export function watchlistStorageKey(capability) {
  if (!validWatchlistCapability(capability)) return ''
  return `watchlist:${capability}`
}

function validSymbols(value, limit) {
  return Array.isArray(value)
    && value.length <= limit
    && new Set(value).size === value.length
    && value.every((symbol) => typeof symbol === 'string' && SYMBOL_RE.test(symbol))
}

function validClock(value, allowedParts, allowDeletedIds = false) {
  if (!plainObject(value) || Object.keys(value).length > MAX_NAMED_LISTS + 1) return false
  return Object.entries(value).every(([part, stamp]) =>
    (allowedParts.has(part) || (allowDeletedIds && LIST_ID_RE.test(part)))
    && Number.isSafeInteger(stamp)
    && stamp >= 0)
}

export function validateWatchlistDocument(value) {
  if (!plainObject(value)
      || !exactKeys(value, new Set(['main', 'lists', 'touched', 'deleted']))) {
    return { ok: false, error: 'invalid document shape' }
  }
  if (!validSymbols(value.main, MAX_MAIN_SYMBOLS)) {
    return { ok: false, error: 'invalid main watchlist' }
  }
  if (!Array.isArray(value.lists) || value.lists.length > MAX_NAMED_LISTS) {
    return { ok: false, error: 'invalid named watchlists' }
  }
  const ids = new Set()
  for (const list of value.lists) {
    if (!plainObject(list)
        || !exactKeys(list, new Set(['id', 'name', 'symbols']))
        || typeof list.id !== 'string'
        || !LIST_ID_RE.test(list.id)
        || ids.has(list.id)
        || typeof list.name !== 'string'
        || !list.name.trim()
        || list.name.length > MAX_NAME_CHARS
        || !validSymbols(list.symbols, MAX_LIST_SYMBOLS)) {
      return { ok: false, error: 'invalid named watchlist' }
    }
    ids.add(list.id)
  }
  const parts = new Set(['main', ...ids])
  if (!validClock(value.touched, parts) || !validClock(value.deleted, parts, true)) {
    return { ok: false, error: 'invalid sync metadata' }
  }
  if (JSON.stringify(value).length > MAX_BODY_BYTES) {
    return { ok: false, error: 'document too large' }
  }
  return { ok: true }
}

export const handleWatchlists = makeCapDocHandler({
  route: '/watchlists',
  keyPrefix: 'watchlist:',
  validate: validateWatchlistDocument,
  maxBody: MAX_BODY_BYTES,
})
