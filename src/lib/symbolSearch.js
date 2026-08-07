// Company-name → ticker lookup, every venue Yahoo knows: "Hynix" finds the
// NASDAQ listing, the Korea line and the OTC ADR alike. Same v1 search the
// news panel uses, so it rides the existing worker proxy.

import { proxyBase } from './feed.js'

export function parseSymbolSearch(data) {
  return (data?.quotes || [])
    .filter((q) => q?.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exch: q.exchDisp || q.exchange || '',
      type: q.quoteType,
    }))
}

export async function searchSymbols(q, { signal } = {}) {
  // 12 fetched so five suggestions usually survive the EQUITY/ETF filter —
  // at 8 a name-heavy query could thin out below the 5 the dropdown shows
  const url = `${proxyBase()}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0`
  const resp = await fetch(url, { signal: signal ?? AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`search: HTTP ${resp.status}`)
  return parseSymbolSearch(await resp.json())
}

/** Does this string name something the data provider actually knows?
 *
 *  Typing junk in the command bar used to navigate anyway and land on a dead
 *  research page ("history 13455: HTTP 404", Jeff 2026-08-07). The console
 *  can only refuse if it knows, and the only authority is the provider — so
 *  ask it, unless a local answer is already available:
 *
 *   - cached quote/watchlist hit  → yes, instantly (no round-trip for names
 *     you already look at)
 *   - all digits, no suffix       → no, instantly (no venue lists a bare
 *     number; Tokyo/Korea codes carry .T/.KS and still get checked)
 *   - otherwise                   → provider search must return that exact
 *     symbol; a name-only match ("apple") is NOT a symbol
 *
 *  Throws if the lookup itself fails, so the caller can distinguish "no such
 *  symbol" from "couldn't tell".
 */
export async function symbolExists(raw, { cached = () => null, search = searchSymbols, signal } = {}) {
  const sym = String(raw || '').trim().toUpperCase()
  if (!sym) return false
  if (cached(sym)) return true
  if (/^\d+$/.test(sym)) return false
  const hits = await search(sym, { signal })
  return hits.some((hit) => String(hit.symbol).toUpperCase() === sym)
}
