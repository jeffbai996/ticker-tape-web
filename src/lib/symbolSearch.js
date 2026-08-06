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
  const url = `${proxyBase()}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`
  const resp = await fetch(url, { signal: signal ?? AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`search: HTTP ${resp.status}`)
  return parseSymbolSearch(await resp.json())
}
