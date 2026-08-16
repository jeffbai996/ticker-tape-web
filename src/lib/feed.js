// Live quote feed: Yahoo's WebSocket updates one symbol at a time; batched v7
// snapshots provide first paint/recovery, and spaced v8 charts fill analytics.
// No secrets, no cron, no build-time data — the browser is the pipeline.

import {
  barsFromChart, mergeSnapshotQuote, quoteFromStream, quoteFromV7,
} from './yahoo.js'
import { isOvernight } from './marketState.js'
import { applyOvernightFill } from './overnightFill.js'
import { wireUrl } from './wire.js'
import { createYahooStream } from './yahooStream.js'
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
const REFRESH_MS = 60_000        // full sweep cadence (charts + technicals)
const QUOTE_SWEEP_MS = 30_000    // price-only v7 batch — extended hours ticks
const STREAM_FRESH_MS = 90_000   // snapshots stay fallback while ticks flow

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
// v3: histo bars carry close/high/low so the spark column can draw price and
// range shapes, not just volume — a v2 entry would render an empty line.
// v4: a full year of bars per symbol so the spark WINDOW (1M…1Y) is a slice
// rather than a fetch. That's ~14KB a symbol, so the cap drops to 60 entries
// — a watchlist runs ~25, and blowing the localStorage quota silently kills
// persistence for the whole cache, not just the overflow.
const cache = createPCache('feed_cache_v4', { max: 60 })
const listeners = new Set()
let queue = []
let pumping = false
let sweepTimer = null
let liveStream = null

export function getCached(symbol) {
  return cache.get(symbol) || null
}

export function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ?freeze=1 diagnostic: halt every live update notification so a shimmer
// report can be bisected in one look — still shimmering under freeze means
// animation/OS-zoom, gone means data-driven repaints (Jeff 2026-08-11).
const FROZEN = typeof location !== 'undefined' && /[?&]freeze/.test(location.search)

function emit(symbol) {
  if (FROZEN) return
  for (const fn of listeners) fn(symbol, cache.get(symbol))
}

function streamSymbols(symbols) {
  if (!globalThis.WebSocket) return
  if (!liveStream) {
    liveStream = createYahooStream({
      onTick(tick) {
        if (!tracked.has(tick.symbol)) return
        const previous = cache.get(tick.symbol) || {}
        cache.set(tick.symbol, {
          ...previous,
          quote: quoteFromStream(tick, previous.quote),
          // Chart freshness is a different clock: a price tick must not make
          // the histogram/badge pump think its 1Y data was refreshed.
          ts: previous.ts ?? 0,
          streamTs: Date.now(),
        })
        goodTs = Date.now()
        emit(tick.symbol)
      },
    })
  }
  liveStream.setSymbols(symbols)
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
  if (quote && !quote.name) {
    // A stream tick (or a batch miss) can seed the cache nameless; the chart
    // meta in hand has the full name, so backfill instead of shrugging.
    const nm = result.meta?.longName || result.meta?.shortName || ''
    if (nm) {
      quote = { ...quote, name: nm }
      cache.get(symbol).quote = quote
    }
  }
  if (!quote) {
    // Batch hasn't landed (or failed): derive an honest day quote from the
    // daily series — last close vs the one before it.
    const meta = result.meta || {}
    const price = meta.regularMarketPrice ?? closes[closes.length - 1] ?? 0
    const prev = meta.previousClose ?? (closes.length >= 2 ? closes[closes.length - 2] : null)
    const change = prev != null && price ? price - prev : 0
    quote = {
      symbol,
      // longName first: Yahoo truncates shortName at 31 chars, so TSM read
      // "Taiwan Semiconductor Manufactur" — a cut name no marquee can restore
      // (Jeff 2026-08-04). Overflow is a display problem, solved by <Marquee>.
      name: meta.longName || meta.shortName || '',
      price,
      change,
      pct: prev ? (change / prev) * 100 : 0,
      prevClose: prev ?? null,
      dayHigh: meta.regularMarketDayHigh ?? null,
      dayLow: meta.regularMarketDayLow ?? null,
      volume: meta.regularMarketVolume ?? null,
      marketTime: meta.regularMarketTime ?? null,
      quoteType: meta.instrumentType || '',
    }
  }

  cache.set(symbol, {
    quote,
    histo: histoBars(bars),
    tech: techBadges({ closes, volumes }, symbol === RS_BENCH ? null : benchCloses),
    ts: Date.now(),
    streamTs: cache.get(symbol)?.streamTs ?? 0,
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
        const snapshot = quoteFromV7(row)
        const streamIsFresh = prev?.streamTs && Date.now() - prev.streamTs < STREAM_FRESH_MS
        // Keep the old ts: this fills the quote, but the chart fetch (histo
        // + badges) is still owed — a fresh ts would make track() skip it.
        cache.set(row.symbol, {
          quote: mergeSnapshotQuote(prev?.quote, snapshot, streamIsFresh),
          histo: prev?.histo || [],
          tech: prev?.tech || null,
          ts: prev?.ts ?? 0,
          streamTs: prev?.streamTs ?? 0,
        })
        emit(row.symbol)
      }
    } catch { /* pump fills the gap */ }
  }
}

const tracked = new Set()

/** Overnight, the wire's IBKR-backed /api/quotes fills the thin-stream gap:
 *  Yahoo's REST print freezes at 20:00 ET and the websocket only ticks names
 *  that happen to trade, while the sidecar always has the OVERNIGHT book.
 *  Wired builds only — without an endpoint this never fires. */
async function overnightSweep() {
  const base = wireUrl()
  if (!base || !isOvernight() || !tracked.size) return
  try {
    const syms = [...tracked].filter((s) => /^[A-Z0-9.-]{1,10}$/.test(s)).slice(0, 60)
    const resp = await fetch(
      `${base.replace(/\/$/, '')}/api/quotes?symbols=${syms.join(',')}`,
      { signal: AbortSignal.timeout(12_000) })
    if (!resp.ok) return
    const out = await resp.json()
    const nowSec = Date.now() / 1000
    for (const [sym, row] of Object.entries(out.quotes || {})) {
      const hit = cache.get(sym)
      if (!hit?.quote) continue
      const merged = applyOvernightFill(hit.quote, row, nowSec)
      if (merged === hit.quote) continue
      cache.set(sym, { ...hit, quote: merged })
      emit(sym)
    }
  } catch { /* the stream and v7 batch still carry the page */ }
}

// Every browser throttles a background tab's timers to minutes, so the 30s
// sweep effectively stops while the tab is hidden and a return lands on
// whatever print was current when it was backgrounded. Sweeping on the
// visibility flip means the first frame the user sees is already refetching
// (2026-08-10). Registered once, on the first track() — the module can be
// imported in tests with no document at all.
let visibilityHooked = false
function hookVisibility() {
  if (visibilityHooked || typeof document === 'undefined') return
  visibilityHooked = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !tracked.size) return
    scheduleBatch([...tracked])
    setTimeout(overnightSweep, 5_000)
  })
}

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
  streamSymbols([...tracked])
  // RS benchmark first, so badge rows can diff against it from the start.
  if (!benchCloses && queue.length && queue[0] !== RS_BENCH) {
    queue = [RS_BENCH, ...queue.filter((s) => s !== RS_BENCH)]
  }
  pump()
  hookVisibility()
  if (!sweepTimer) {
    // prices twice as often as charts: the v7 batch is one cheap request,
    // and pre/after-hours reads freeze visibly at a 60s cadence
    let beat = 0
    // the fill runs AFTER each v7 batch lands: the batch's frozen 20:00
    // print would otherwise overwrite the live overnight number it just wrote
    setTimeout(overnightSweep, 5_000)
    sweepTimer = setInterval(() => {
      scheduleBatch([...tracked])
      setTimeout(overnightSweep, 5_000)
      beat += 1
      if (beat % 2 === 0) {
        queue.push(...tracked)
        pump()
      }
    }, QUOTE_SWEEP_MS)
  }
}
