// SEC filings for a symbol — via Yahoo's secFilings module on the existing
// crumb proxy. sec.gov itself 403s Cloudflare Worker egress IPs, so going to
// EDGAR direct only works server-side; Yahoo mirrors the filings index with
// titles and EDGAR links, which is exactly what a filings tab needs.

import { createPCache } from './pcache.js'

function crumbBase() {
  if (import.meta.env.VITE_DATA_PROXY) return import.meta.env.VITE_DATA_PROXY
  const saved = localStorage.getItem('proxy_url')
  if (saved) return saved.replace(/\/$/, '')
  return 'https://yf-proxy.2phakhvpgh.workers.dev'
}

/** Pure: normalize the secFilings module into table rows. */
export function parseSecFilings(result, limit = 30) {
  const rows = result?.secFilings?.filings || []
  return rows
    .filter((f) => f?.type && (f?.date || f?.epochDate))
    .slice(0, limit)
    .map((f) => ({
      date: f.date || new Date(f.epochDate * 1000).toISOString().slice(0, 10),
      form: f.type,
      title: f.title || '',
      url: f.edgarUrl || '',
      exhibits: (f.exhibits || [])
        .filter((x) => x?.url)
        .map((x) => ({ type: x.type || 'doc', url: x.url })),
    }))
}

const filCache = createPCache('fil_cache_v2', { max: 30 })
const FIL_TTL = 6 * 60 * 60_000

export async function fetchFilings(symbol) {
  const hit = filCache.get(symbol)
  if (hit && Date.now() - hit.ts < FIL_TTL) return hit.value
  const url = `${crumbBase()}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=secFilings`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`filings ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const value = { filings: parseSecFilings(data?.quoteSummary?.result?.[0]) }
  filCache.set(symbol, { value, ts: Date.now() })
  return value
}
