// Options chain via Yahoo v7 (crumb-authed — goes through the Worker, same
// reasoning as fundamentals.js).

import { createPCache } from './pcache.js'

const TTL = 5 * 60_000
const cache = createPCache('opt_cache_v1', { max: 24 })

function crumbBase() {
  if (import.meta.env.VITE_DATA_PROXY) return import.meta.env.VITE_DATA_PROXY
  const saved = localStorage.getItem('proxy_url')
  if (saved) return saved.replace(/\/$/, '')
  return 'https://yf-proxy.2phakhvpgh.workers.dev'
}

function slim(contracts) {
  return (contracts || []).map((c) => ({
    strike: c.strike,
    last: c.lastPrice ?? null,
    bid: c.bid ?? null,
    ask: c.ask ?? null,
    pct: c.percentChange ?? null,
    volume: c.volume ?? null,
    oi: c.openInterest ?? null,
    iv: c.impliedVolatility ?? null,
    itm: !!c.inTheMoney,
  }))
}

export async function fetchOptions(symbol, expiration) {
  const key = `${symbol}:${expiration || 'front'}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL) return hit.value

  const q = expiration ? `?date=${expiration}` : ''
  const url = `${crumbBase()}/v7/finance/options/${encodeURIComponent(symbol)}${q}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`options ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const r = data?.optionChain?.result?.[0]
  if (!r) throw new Error(`options ${symbol}: empty`)

  const value = {
    spot: r.quote?.regularMarketPrice ?? null,
    expirations: r.expirationDates || [],
    expiration: r.options?.[0]?.expirationDate ?? null,
    calls: slim(r.options?.[0]?.calls),
    puts: slim(r.options?.[0]?.puts),
  }
  cache.set(key, { value, ts: Date.now() })
  return value
}
