// Live quote feed: polls Yahoo v8 chart per symbol through the proxy, spaced
// to stay friendly with rate limits, and fans results out to subscribers.
// No secrets, no cron, no build-time data — the browser is the pipeline.

import { barsFromChart, quoteFromV7 } from './yahoo.js'
import { techBadges, histoBars } from './badges.js'
import { createPCache } from './pcache.js'

// RS badge benchmark (TUI: RS vs QQQ, 20d). Its daily closes are kept in
// module memory and prioritized in the queue so other symbols can diff
// against it.
const RS_BENCH = 'QQQ'
let benchCloses = null

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

// symbol -> { quote, histo, tech, ts } — persisted so a refresh paints
// instantly from the last snapshot and only re-fetches what's actually stale.
// v2: chart pump moved from intraday sparks to 1Y daily (histo + badges).
const cache = createPCache('feed_cache_v2', { max: 150 })
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
  // One 1Y daily chart per symbol feeds the histogram spark AND the badge
  // row (RSI / SMA flags / vol ratio / off-high / RS). The day quote itself
  // comes from the v7 batch — a multi-range chart reports change vs range
  // START, the classic day-change trap.
  const url = `${proxyBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`
  const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!resp.ok) throw new Error(`chart ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const result = data?.chart?.result?.[0]
  if (!result) throw new Error(`chart ${symbol}: empty result`)

  const bars = barsFromChart(result)
  const closes = bars.map((b) => b.close)
  const volumes = bars.map((b) => b.volume || 0)
  if (symbol === RS_BENCH) benchCloses = closes

  let quote = cache.get(symbol)?.quote
  if (!quote) {
    // Batch hasn't landed (or failed): derive an honest day quote from the
    // daily series — last close vs the one before it.
    const meta = result.meta || {}
    const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0
    const prev = meta.previousClose ?? (closes.length >= 2 ? closes[closes.length - 2] : null)
    const change = prev != null && price ? price - prev : 0
    quote = {
      symbol,
      name: meta.shortName || meta.longName || '',
      price,
      change,
      pct: prev ? (change / prev) * 100 : 0,
      prevClose: prev ?? null,
      dayHigh: meta.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? null,
      volume: meta.regularMarketVolume ?? null,
      marketTime: meta.regularMarketTime ?? null,
    }
  }

  cache.set(symbol, {
    quote,
    histo: histoBars(bars),
    tech: techBadges({ closes, volumes }, symbol === RS_BENCH ? null : benchCloses),
    ts: Date.now(),
  })
  goodTs = Date.now()
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

// Timestamp of the last successful quote fetch (batch or pump) — drives the
// dashboard's "updated HH:MM:SS" line and its stale-data banner.
let goodTs = 0
export function lastGoodTs() {
  return goodTs
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
      const rows = data?.quoteResponse?.result || []
      if (rows.length) goodTs = Date.now()
      for (const row of rows) {
        const prev = cache.get(row.symbol)
        // Keep the old ts: this fills the quote, but the chart fetch (histo
        // + badges) is still owed — a fresh ts would make track() skip it.
        cache.set(row.symbol, {
          quote: quoteFromV7(row),
          histo: prev?.histo || [],
          tech: prev?.tech || null,
          ts: prev?.ts ?? 0,
        })
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
    scheduleBatch(priority) // instant first paint; the pump follows with charts
  }
  // RS benchmark first, so badge rows can diff against it from the start.
  if (!benchCloses && queue.length && queue[0] !== RS_BENCH) {
    queue = [RS_BENCH, ...queue.filter((s) => s !== RS_BENCH)]
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
