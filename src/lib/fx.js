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

/** Live quote map → `{ USD: 1, CAD: 0.73, ... }` (each ccy in USD). Every
 *  `<CCY>USD=X` pair present is read, not just the display currencies: a book
 *  may legitimately hold a Tokyo or Seoul line, and a currency with no rate
 *  dashes out of every total forever. Pairs that have not priced yet are
 *  simply absent. */
export function ratesFromQuotes(live) {
  const rates = { USD: 1 }
  for (const [sym, entry] of Object.entries(live || {})) {
    const pair = /^([A-Z]{3})USD=X$/.exec(sym)
    if (!pair) continue
    const px = entry?.quote?.price
    if (typeof px === 'number' && Number.isFinite(px) && px > 0) rates[pair[1]] = px
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
// Currency belongs to the listing, not to the person entering it (Jeff
// 2026-08-21) — so the table covers every venue the symbol search can hand
// back, and a row's currency is never something the UI offers to change.
const SUFFIX_CCY = {
  TO: 'CAD', V: 'CAD', NE: 'CAD', CN: 'CAD',
  HK: 'HKD', SS: 'CNY', SZ: 'CNY',
  T: 'JPY', KS: 'KRW', KQ: 'KRW', TW: 'TWD', TWO: 'TWD',
  SI: 'SGD', AX: 'AUD', NZ: 'NZD', BK: 'THB', JK: 'IDR', KL: 'MYR',
  NS: 'INR', BO: 'INR',
  L: 'GBP', IL: 'USD', PA: 'EUR', AS: 'EUR', BR: 'EUR', LS: 'EUR',
  DE: 'EUR', F: 'EUR', MI: 'EUR', MC: 'EUR', VI: 'EUR', IR: 'EUR', HE: 'EUR',
  SW: 'CHF', ST: 'SEK', OL: 'NOK', CO: 'DKK',
  SA: 'BRL', MX: 'MXN', BA: 'ARS', JO: 'ZAR', TA: 'ILS', IS: 'TRY',
}

/** What a holding is denominated in: the quote's own word first (CNH — the
 *  offshore RMB — folds into CNY), the listing suffix as a fallback. */
export function holdingCurrency(symbol, quote) {
  const fromQuote = quote?.currency
  if (fromQuote) return fromQuote === 'CNH' ? 'CNY' : fromQuote
  const suffix = String(symbol || '').split('.')[1]
  return SUFFIX_CCY[suffix?.toUpperCase()] || 'USD'
}

const CCY_MARK = { USD: '$', CAD: 'C$', HKD: 'HK$', CNY: '¥' }

// Quote-price prefixes for foreign listings: home currencies (USD/CAD) stay
// bare, everything else wears its symbol, three characters max (Jeff
// 2026-08-21: "W with bar for won"). Unknown currencies stay unmarked — a
// wrong symbol is worse than none.
const QUOTE_MARK = {
  KRW: '₩', JPY: '¥', CNY: '¥', HKD: 'HK$', TWD: 'NT$',
  EUR: '€', GBP: '£', CHF: 'Fr', INR: '₹', SGD: 'S$', AUD: 'A$',
}

export function ccyMark(ccy) {
  if (!ccy || ccy === 'USD' || ccy === 'CAD') return ''
  return QUOTE_MARK[ccy === 'CNH' ? 'CNY' : ccy] || ''
}

/** Money the reader can tell apart at a glance across a mixed table. */
export function fmtCcy(v, ccy, digits = 0) {
  if (v == null || !Number.isFinite(v)) return '—'
  const mark = CCY_MARK[ccy] || `${ccy} `
  return `${mark}${v.toLocaleString('en-US', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  })}`
}
