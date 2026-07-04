// Live quote feed: polls Yahoo v8 chart per symbol through the proxy, spaced
// to stay friendly with rate limits, and fans results out to subscribers.
// No secrets, no cron, no build-time data — the browser is the pipeline.

import { quoteFromChart, sparkFromChart, quoteFromV7 } from './yahoo.js'
import { createPCache } from './pcache.js'

// v7 batch quotes need crumb auth, so they always go through the Worker —
// the dev server's dumb /yf pass-through can't do the cookie dance.
function crumbBase() {
  if (import.meta.env.VITE_DATA_PROXY) return import.meta.env.VITE_DATA_PROXY
  const saved = localStorage.getItem('proxy_url')
  if (saved) return saved.replace(/\/$/, '')
  return 'https://yf-proxy.2phakhvpgh.workers.dev'
}

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

// Batch first paint: one v7 request prices a whole page at once, so quotes
// don't trickle in at pump spacing. The per-symbol chart pump still runs
// behind it to fill sparks. Coalesced so several track() calls in one render
// pass cost one request.
let batchTimer = null
const batchWanted = new Set()

function scheduleBatch(symbols) {
  for (const s of symbols) batchWanted.add(s)
  clearTimeout(batchTimer)
  batchTimer = setTimeout(runBatch, 50)
}

async function runBatch() {
  const syms = [...batchWanted]
  batchWanted.clear()
  for (let i = 0; i < syms.length; i += 40) {
    const chunk = syms.slice(i, i + 40)
    try {
      const url = `${crumbBase()}/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}`
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (!resp.ok) continue // pump fills the gap one by one
      const data = await resp.json()
      for (const row of data?.quoteResponse?.result || []) {
        const prev = cache.get(row.symbol)
        // Keep the old ts: this fills the quote, but the chart fetch (spark)
        // is still owed — a fresh ts would make track() skip it next time.
        cache.set(row.symbol, { quote: quoteFromV7(row), spark: prev?.spark || [], ts: prev?.ts ?? 0 })
        emit(row.symbol)
      }
    } catch { /* pump fills the gap */ }
  }
}

const tracked = new Set()

/** Track symbols: serve the persisted snapshot immediately, fetch only what's
 *  stale, then refresh everything on the sweep cadence. Requested symbols jump
 *  to the front of the queue — the page being looked at fills first, instead
 *  of waiting behind the sidebar's watchlist tail on a cold cache. */
export function track(symbols) {
  const priority = []
  for (const s of symbols) {
    const isNew = !tracked.has(s)
    if (isNew) tracked.add(s)
    const hit = cache.get(s)
    const stale = !hit || Date.now() - hit.ts >= REFRESH_MS
    if (stale && (isNew || queue.includes(s))) priority.push(s)
  }
  if (priority.length) {
    queue = [...priority, ...queue.filter((s) => !priority.includes(s))]
    scheduleBatch(priority) // instant first paint; the pump follows for sparks
  }
  pump()
  if (!sweepTimer) {
    sweepTimer = setInterval(() => {
      scheduleBatch([...tracked]) // refresh all prices in one request
      queue.push(...tracked)
      pump()
    }, REFRESH_MS)
  }
}
