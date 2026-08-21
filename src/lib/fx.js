/** Currency conversion for the hand-built portfolios.
 *
 *  A book can hold USD, CAD, HKD and CNY names at once and display in any of
 *  them. Every conversion crosses through USD on live Yahoo FX pairs
 *  (CADUSD=X etc.) — one hop in, one hop out — so four currencies cost three
 *  followed quotes, not six pairwise ones. A missing rate yields null, never
 *  a silent 1:1: a wrong total is worse than a dash.
 */

export const PORTFOLIO_CCYS = ['USD', 'CAD', 'HKD', 'CNY']

/** The Yahoo pair that prices one unit of `ccy` in USD; USD needs none. */
export function fxPairSymbol(ccy) {
  return ccy && ccy !== 'USD' ? `${ccy}USD=X` : null
}

/** Unique pair symbols a set of holding/display currencies needs followed. */
export function fxSymbolsFor(ccys) {
  const out = []
  for (const ccy of ccys || []) {
    const sym = fxPairSymbol(ccy)
    if (sym && !out.includes(sym)) out.push(sym)
  }
  return out
}

/** Live quote map → `{ USD: 1, CAD: 0.73, ... }` (each ccy in USD). Pairs
 *  that have not priced yet are simply absent. */
export function ratesFromQuotes(live) {
  const rates = { USD: 1 }
  for (const ccy of PORTFOLIO_CCYS) {
    const sym = fxPairSymbol(ccy)
    if (!sym) continue
    const px = live?.[sym]?.quote?.price
    if (typeof px === 'number' && Number.isFinite(px) && px > 0) rates[ccy] = px
  }
  return rates
}

/** Convert via the USD cross. Null when the amount or either rate is missing. */
export function convertCcy(amount, from, to, rates) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return null
  if (from === to) return amount
  const rFrom = rates?.[from]
  const rTo = rates?.[to]
  if (!rFrom || !rTo) return null
  return (amount * rFrom) / rTo
}

// Listing-suffix fallback for before the quote lands (or a dead symbol).
const SUFFIX_CCY = { TO: 'CAD', V: 'CAD', NE: 'CAD', HK: 'HKD', SS: 'CNY', SZ: 'CNY' }

/** What a holding is denominated in: the quote's own word first (CNH — the
 *  offshore RMB — folds into CNY), the listing suffix as a fallback. */
export function holdingCurrency(symbol, quote) {
  const fromQuote = quote?.currency
  if (fromQuote) return fromQuote === 'CNH' ? 'CNY' : fromQuote
  const suffix = String(symbol || '').split('.')[1]
  return SUFFIX_CCY[suffix?.toUpperCase()] || 'USD'
}

const CCY_MARK = { USD: '$', CAD: 'C$', HKD: 'HK$', CNY: '¥' }

/** Money the reader can tell apart at a glance across a mixed table. */
export function fmtCcy(v, ccy, digits = 0) {
  if (v == null || !Number.isFinite(v)) return '—'
  const mark = CCY_MARK[ccy] || `${ccy} `
  return `${mark}${v.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  })}`
}
