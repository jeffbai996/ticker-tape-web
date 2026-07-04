// Command-palette backends: local nav matching (pure) + Yahoo symbol lookup.

import { proxyBase } from './feed.js'
import { createPCache } from './pcache.js'
import { NAV } from './nav.js'
import { hrefFor } from './route.js'

/** Nav sections/sub-tabs whose label matches the query. Empty query → all sections. */
export function filterNav(query) {
  const q = (query || '').trim().toLowerCase()
  const out = []
  for (const section of NAV) {
    if (!q || section.label.toLowerCase().includes(q)) {
      out.push({ kind: 'nav', label: section.label, href: hrefFor(section.id) })
    }
    for (const sub of section.subs) {
      if (q && sub.label.toLowerCase().includes(q)) {
        out.push({ kind: 'nav', label: `${section.label} / ${sub.label}`, href: hrefFor(section.id, sub.id) })
      }
    }
  }
  return out
}

const cache = createPCache('sym_search_v1', { max: 60 })
const TTL = 60 * 60_000

/** Symbol lookup via Yahoo search: [{symbol, name, exchange, type}]. */
export async function searchSymbols(query) {
  const q = (query || '').trim()
  if (!q) return []
  const key = q.toLowerCase()
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL) return hit.value

  const url = `${proxyBase()}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`search: HTTP ${resp.status}`)
  const data = await resp.json()
  const value = (data?.quotes || [])
    .filter((x) => x.symbol)
    .map((x) => ({
      symbol: x.symbol,
      name: x.shortname || x.longname || '',
      exchange: x.exchDisp || x.exchange || '',
      type: x.quoteTypeDisp || x.quoteType || '',
    }))
  cache.set(key, { value, ts: Date.now() })
  return value
}
