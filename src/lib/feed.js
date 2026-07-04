// Live quote feed: polls Yahoo v8 chart per symbol through the proxy, spaced
// to stay friendly with rate limits, and fans results out to subscribers.
// No secrets, no cron, no build-time data — the browser is the pipeline.

import { quoteFromChart, sparkFromChart } from './yahoo.js'
import { createPCache } from './pcache.js'

const REQUEST_SPACING_MS = 350   // min gap between proxy requests
const REFRESH_MS = 60_000        // full sweep cadence

// Proxy resolution order: explicit build-time override, per-browser setting,
// then the dev server's built-in proxy or the deployed default.
export function proxyBase() {
  if (import.meta.env.VITE_DATA_PROXY) return import.meta.env.VITE_DATA_PROXY
  const saved = localStorage.getItem('proxy_url')
  if (saved) return saved.replace(/\/$/, '')
  return import.meta.env.DEV ? '/yf' : 'https://yf-proxy.2phakhvpgh.workers.dev'
}

// symbol -> { quote, spark, ts } — persisted so a refresh paints instantly
// from the last snapshot and only re-fetches what's actually stale.
const cache = createPCache('feed_cache_v1', { max: 150 })
const listeners = new Set()
let queue = []
let pumping = false
let sweepTimer = null

export function getCached(symbol) {
  return cache.get(symbol) || null
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit(symbol) {
  for (const fn of listeners) fn(symbol, cache.get(symbol))
}

async function fetchSymbol(symbol) {
  const url = `${proxyBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=true`
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`chart ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(`chart ${symbol}: empty result`)
  cache.set(symbol, { quote: quoteFromChart(result), spark: sparkFromChart(result), ts: Date.now() })
  emit(symbol)
}

async function pump() {
  if (pumping) return
  pumping = true
  while (queue.length) {
    const symbol = queue.shift()
    try {
      await fetchSymbol(symbol)
    } catch (e) {
      console.warn('[feed]', e.message ?? e)
    }
    await new Promise((r) => setTimeout(r, REQUEST_SPACING_MS))
  }
  pumping = false
}

const tracked = new Set()

/** Track symbols: serve the persisted snapshot immediately, fetch only what's
 *  stale, then refresh everything on the sweep cadence. */
export function track(symbols) {
  for (const s of symbols) {
    if (!tracked.has(s)) {
      tracked.add(s)
      const hit = cache.get(s)
      if (!hit || Date.now() - hit.ts >= REFRESH_MS) queue.push(s)
    }
  }
  pump()
  if (!sweepTimer) {
    sweepTimer = setInterval(() => {
      queue.push(...tracked)
      pump()
    }, REFRESH_MS)
  }
}
