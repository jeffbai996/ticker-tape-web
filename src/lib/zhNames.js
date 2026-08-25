/** Chinese listing names → symbols, checked BEFORE the provider.
 *
 *  Yahoo's search ignores Chinese queries entirely — "中国人寿" returns
 *  nothing with or without lang/region (verified at the source 2026-08-22).
 *  A zh reader could only add holdings by code or English name.
 *
 *  The table is GENERATED from the exchanges' own lists (HKEX English +
 *  繁體 workbooks, SSE main + STAR, SZSE, Tencent batch quotes for HK in
 *  简体) by scripts/gen_zh_names.py — every HK / Shanghai / Shenzhen
 *  listing, ~8,400 rows, not a hand-kept subset. It ships as its own lazy
 *  chunk (~100 KB gzipped) that loads on the first Chinese query or the
 *  first zh-locale render, never on an English session's critical path.
 */

import { getLocale } from './i18n.js'
import { ZH_NAME_OVERRIDES } from './zhNames.overrides.js'
const CJK = /[㐀-鿿]/
const US_SYMBOL = /^[A-Z][A-Z0-9-]{0,8}(?:\.[A-Z])?$/

let TABLE = null          // symbol -> [简体, 繁體?]
let loading = null
const listeners = new Set()
const missingNameLookups = new Map()

function notifyTable() {
  for (const fn of [...listeners]) fn(TABLE)
}

/** Load the generated table once; resolves to it. Safe to call repeatedly. */
export function loadZhTable() {
  if (TABLE) return Promise.resolve(TABLE)
  if (!loading) {
    loading = import('./zhNames.data.json')
      .then((m) => {
        TABLE = { ...(m.default || m), ...ZH_NAME_OVERRIDES }
        notifyTable()
        return TABLE
      })
      .catch(() => { loading = null; return null })
  }
  return loading
}

/** Subscribe to the table arriving; the unsubscribe is returned. A render
 *  that asked for a name before the chunk landed re-renders on this. */
export function onZhTable(fn) {
  listeners.add(fn)
  if (TABLE) fn(TABLE)
  return () => listeners.delete(fn)
}

export function zhTableLoaded() {
  return TABLE != null
}

/** Does this query need the table at all? */
export function hasCjk(q) {
  return CJK.test(String(q || ''))
}

/** The Chinese name for a symbol, or null — including while the chunk is
 *  still loading, which is why callers keep the provider name as fallback. */
/** The provider's name, or the table's Chinese one when the reader is in
 *  zh — the single rule every name on the board follows (Jeff 2026-08-22:
 *  "only Chinese names in the portfolio function and nowhere else"). */
export function localName(symbol, fallback = '') {
  if (getLocale() !== 'zh') return fallback
  return zhName(symbol) || fallback
}

export function zhName(symbol, { traditional = false } = {}) {
  const key = String(symbol || '').toUpperCase()
  // Yahoo writes US share classes BRK-B, the source directory wrote BRK.B —
  // same listing, so the lookup tries both spellings (Jeff 2026-08-22)
  const row = TABLE?.[key] || TABLE?.[key.replace(/-([A-Z])$/, '.$1')] || TABLE?.[key.replace(/\.([A-Z])$/, '-$1')]
  if (!row) return null
  return traditional ? (row[1] || row[0]) : row[0]
}

async function fetchMissingZhName(symbol) {
  const { proxyBase } = await import('./feed.js')
  const resp = await fetch(`${proxyBase()}/cn/us-name?symbol=${encodeURIComponent(symbol)}`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!resp.ok) return null
  const name = String((await resp.json())?.name || '').trim()
  return CJK.test(name) ? name : null
}

/** Fill a table gap for a US name from the same Chinese market source that
 * supplies the generated directory. The result is memory-only and cached at
 * the proxy, so a user never needs a name-specific source override. */
export function loadMissingZhName(symbol, { lookup = fetchMissingZhName } = {}) {
  const key = String(symbol || '').trim().toUpperCase()
  if (!TABLE || zhName(key) || !US_SYMBOL.test(key)) return Promise.resolve(zhName(key))
  if (!missingNameLookups.has(key)) {
    const pending = Promise.resolve(lookup(key))
      .then((name) => {
        const clean = String(name || '').trim()
        if (!CJK.test(clean)) return null
        TABLE[key] = [clean]
        notifyTable()
        return clean
      })
      .catch(() => null)
      .finally(() => missingNameLookups.delete(key))
    missingNameLookups.set(key, pending)
  }
  return missingNameLookups.get(key)
}

const venueOf = (symbol) => (
  symbol.endsWith('.HK') ? 'HKG' : symbol.endsWith('.SS') ? 'SHH' : symbol.endsWith('.SZ') ? 'SHZ' : '')
const isFund = (name) => /ETF|基金|LOF|REIT/i.test(name)

/** Suggestion rows for a Chinese query, provider-shaped ({symbol, name,
 *  exch, type}) so a dropdown needs no special case. Prefix matches rank
 *  first; a query that merely contains a name ("买腾讯") still hits. Empty
 *  until the table has loaded — pair with loadZhTable(). */
export function zhAliasHits(query, { limit = 8 } = {}) {
  const q = String(query || '').replace(/\s+/g, '')
  if (q.length < 2 || !CJK.test(q) || !TABLE) return []
  const scored = []
  for (const symbol in TABLE) {
    const names = TABLE[symbol]
    let best = 0
    for (const n of names) {
      if (n.startsWith(q)) best = Math.max(best, 3)
      else if (n.includes(q)) best = Math.max(best, 2)
      else if (q.includes(n)) best = Math.max(best, 1)
    }
    if (best) scored.push([best, symbol])
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]))
  return scored.slice(0, limit).map(([, symbol]) => ({
    symbol, name: TABLE[symbol][0], exch: venueOf(symbol),
    type: isFund(TABLE[symbol][0]) ? 'ETF' : 'EQUITY',
  }))
}

/** Test/diagnostic hook — every symbol the loaded table knows. */
export function zhKnownSymbols() {
  return TABLE ? Object.keys(TABLE) : []
}
