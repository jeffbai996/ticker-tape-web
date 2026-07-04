// One-shot fetches for the Research view: OHLC history and news headlines.
// Light TTL cache so tab-flipping doesn't refetch.

import { proxyBase } from './feed.js'
import { quoteFromChart, barsFromChart } from './yahoo.js'
import { createPCache } from './pcache.js'

export const RANGES = [
  { key: '1D', range: '1d', interval: '5m', intraday: true, ttl: 60_000 },
  { key: '5D', range: '5d', interval: '15m', intraday: true, ttl: 5 * 60_000 },
  { key: '1M', range: '1mo', interval: '1d', ttl: 10 * 60_000 },
  { key: '6M', range: '6mo', interval: '1d', ttl: 10 * 60_000 },
  { key: '1Y', range: '1y', interval: '1d', ttl: 10 * 60_000 },
  { key: '2Y', range: '2y', interval: '1d', ttl: 30 * 60_000 },
  { key: '5Y', range: '5y', interval: '1wk', ttl: 30 * 60_000 },
]

const NEWS_TTL = 10 * 60_000

// Persisted across refreshes: history bars are the heavy fetches, so serving
// them from the last snapshot within TTL makes navigation/refresh instant.
const cache = createPCache('hist_cache_v1', { max: 48 })

async function cached(key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttl) return hit.value
  const value = await fn()
  cache.set(key, { value, ts: Date.now() })
  return value
}

export function fetchHistory(symbol, rangeKey) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[2]
  return cached(`h:${symbol}:${r.key}`, r.ttl, async () => {
    const url = `${proxyBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r.range}&interval=${r.interval}`
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!resp.ok) throw new Error(`history ${symbol}: HTTP ${resp.status}`)
    const data = await resp.json()
    const result = data?.chart?.result?.[0]
    if (!result) throw new Error(`history ${symbol}: empty`)
    return { quote: quoteFromChart(result), bars: barsFromChart(result), intraday: !!r.intraday }
  })
}

export function fetchNews(symbol) {
  return cached(`n:${symbol}`, NEWS_TTL, async () => {
    const url = `${proxyBase()}/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&quotesCount=0`
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!resp.ok) throw new Error(`news ${symbol}: HTTP ${resp.status}`)
    const data = await resp.json()
    // Keep time as epoch ms — Date objects don't survive the JSON persist.
    return (data?.news || []).map((n) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      time: n.providerPublishTime ? n.providerPublishTime * 1000 : null,
    }))
  })
}
