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
const CJK = /[㐀-鿿]/

let TABLE = null          // symbol -> [简体, 繁體?]
let loading = null
const listeners = new Set()

/** Load the generated table once; resolves to it. Safe to call repeatedly. */
export function loadZhTable() {
  if (TABLE) return Promise.resolve(TABLE)
  if (!loading) {
    loading = import('./zhNames.data.json')
      .then((m) => {
        TABLE = m.default || m
        for (const fn of [...listeners]) fn(TABLE)
        return TABLE
      })
      .catch(() => { loading = null; return null })
  }
  return loading
}

/** Subscribe to the table arriving; the unsubscribe is returned. A render
 *  that asked for a name before the chunk landed re-renders on this. */
export function onZhTable(fn) {
  if (TABLE) { fn(TABLE); return () => {} }
  listeners.add(fn)
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
  const row = TABLE?.[String(symbol || '').toUpperCase()]
  if (!row) return null
  return traditional ? (row[1] || row[0]) : row[0]
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
