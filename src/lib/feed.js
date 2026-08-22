// Live quote feed: Yahoo's WebSocket updates one symbol at a time; batched v7
// snapshots provide first paint/recovery, and spaced v8 charts fill analytics.
// No secrets, no cron, no build-time data — the browser is the pipeline.
//
// Futures (ES, NQ, YM, GC, CL) ride the batch, not the stream. Yahoo's public
// WebSocket carries no ticks for them — verified 2026-08-18: zero futures ticks
// in a 45s window while SPY and AAPL streamed normally on the same socket. Their
// prices are live and correct, they just refresh on the batch cadence instead of
// printing tick by tick. A futures row sitting still between polls is that
// cadence, not a stall in the stream path.

import {
  barsFromChart, mergeSnapshotQuote, quoteFromStream, quoteFromV7,
} from './yahoo.js'
import { isOvernight, marketState } from './marketState.js'
import { applyOvernightFill } from './overnightFill.js'
import { wireServiceUrl } from './wire.js'
import { createYahooStream } from './yahooStream.js'
import { techBadges, histoBars } from './badges.js'
import { createPCache } from './pcache.js'
import {
  FOCUS_MAX, createFeedSymbolRegistry, nextPumpIndex, orderFocusedFirst,
} from './feedSymbols.js'
import { symbolFreshness } from './feedHealth.js'

// RS badge benchmark (TUI: RS vs QQQ, 20d). Its daily closes are kept in
// module memory and prioritized in the queue so other symbols can diff
// against it.
const RS_BENCH = 'QQQ'
let benchCloses = null

// v7 batch quotes need crumb auth, so they always go through the Worker —
// the dev server's dumb /yf pass-through can't do the cookie dance.
const DEFAULT_PROXY = 'https://yf-proxy.2phakhvpgh.workers.dev'

// A stale `proxy_url` override is how the private instance quietly diverges
// from the demo: same bundle, but one browser drags months-old config to a
// proxy that has since slowed or died, and the feed crawls while every other
// device is fine (Jeff 2026-08-21). After three straight batch failures the
// override is benched for the session and the default worker takes over —
// loudly, in the console, so the config gets cleaned up instead of forgotten.
let proxyFailStreak = 0
let proxyBenched = false

// The first successful price batch is the moment lower-priority lookups
// (earnings badges, the docket) may start without pushing prices back. Pages
// await this instead of guessing with a timer (waterfall, 2026-08-22).
let firstBatchResolve = null
const firstBatch = new Promise((resolve) => { firstBatchResolve = resolve })
let firstBatchDone = false

/** Resolves once one price batch has landed; settles at `timeoutMs` anyway so
 *  a dead feed never holds secondary lookups hostage. */
export function whenFirstBatch(timeoutMs = 6_000) {
  if (firstBatchDone) return Promise.resolve(true)
  return Promise.race([firstBatch, new Promise((r) => setTimeout(() => r(false), timeoutMs))])
}

export function reportProxyBatch(ok) {
  if (ok) {
    proxyFailStreak = 0
    if (!firstBatchDone) { firstBatchDone = true; firstBatchResolve(true) }
    return
  }
  if (proxyBenched || import.meta.env.VITE_DATA_PROXY) return
  let saved = null
  try { saved = localStorage.getItem('proxy_url') } catch { return }
  if (!saved) return
  proxyFailStreak += 1
  if (proxyFailStreak >= 3) {
    proxyBenched = true
    console.warn(`[feed] custom proxy_url "${saved}" failed ${proxyFailStreak} batches — using the default worker for this session. Clear it with localStorage.removeItem('proxy_url').`)
  }
}

function crumbBase() {
  if (import.meta.env.VITE_DATA_PROXY) return import.meta.env.VITE_DATA_PROXY
  if (!proxyBenched) {
    const saved = localStorage.getItem('proxy_url')
    if (saved) return saved.replace(/\/$/, '')
  }
  return DEFAULT_PROXY
}

const REQUEST_SPACING_MS = 350   // min gap between proxy requests
const REFRESH_MS = 60_000        // full sweep cadence (charts + technicals)
const QUOTE_SWEEP_MS = 30_000    // price-only v7 batch — extended hours ticks

/** Sweep cadence follows the tape. Regular hours: the websocket carries every
 *  print, the batch is a safety net → 30s. Pre/post: the stream is thin for
 *  most names and the ext print IS the number people watch → 15s. Overnight:
 *  the sidecar fill runs behind each sweep, so 30s keeps that leg unchanged
 *  (it is the only leg that touches the private server). Closed with no
 *  overnight session (weekends, holidays): nothing prints → 120s. */
export function sweepIntervalMs(state, overnight = false, streamUp = true) {
  if (state === 'open' && !streamUp) return 10_000
  if (state === 'pre' || state === 'post') return streamUp ? 15_000 : 10_000
  if (state === 'open') return QUOTE_SWEEP_MS
  return overnight ? QUOTE_SWEEP_MS : 120_000
}

const FAST_SWEEP_MS = 10_000        // focused rows while a session is printing
const FAST_IDLE_CHECK_MS = 60_000   // no fast sweep this session: re-check later
/** A full sweep that just ran already carries every focused row, so the extra
 *  request would be a duplicate of a print seconds old. */
export const FOCUS_SWEEP_GRACE_MS = 3_000

/** Cadence for the focused-only leg. It exists to make the rows on screen feel
 *  live, so it runs only while something is actually printing; closed and
 *  overnight get nothing at all (the overnight book has its own sidecar leg,
 *  which this must never touch). Always faster than sweepIntervalMs for the
 *  same session, and exactly one request wide — see FOCUS_MAX. */
export function fastSweepIntervalMs(state) {
  return state === 'open' || state === 'pre' || state === 'post' ? FAST_SWEEP_MS : 0
}

/** Whether the focused leg is worth a request right now. Pure so the budget is
 *  reviewable: the only way this costs anything is a visible, non-hidden board
 *  in a printing session that the full sweep hasn't just covered. */
export function shouldFastSweep({ intervalMs, focusedCount, hidden, sinceFullSweepMs }) {
  if (!intervalMs) return false          // closed / overnight: nothing prints
  if (hidden) return false               // a background tab gets no extra load
  if (!focusedCount) return false        // nothing declared on screen
  return sinceFullSweepMs >= FOCUS_SWEEP_GRACE_MS
}

/** Age of the price on a row, by the newest of the three quote clocks. `ts`
 *  is deliberately excluded — it stamps the 1Y chart fetch, not the quote. */
export function quoteAgeMs(entry, now = Date.now()) {
  const newest = Math.max(entry?.streamTs || 0, entry?.snapshotTs || 0, entry?.overnightTs || 0)
  return newest ? now - newest : Infinity
}

/** Rows entering the viewport whose quote is older than the sweep that was
 *  supposed to keep them current — those are the ones worth a request now
 *  rather than at the next sweep. */
export function staleFocusSymbols(symbols, entryOf, intervalMs, now = Date.now()) {
  return (symbols || []).filter((symbol) => quoteAgeMs(entryOf(symbol), now) >= intervalMs)
}

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
let fastTimer = null
let liveStream = null
// outage = a stream that HAS been up and lost its socket; a socket that
// hasn't finished its first handshake is boot, not an outage
let streamWasUp = false

/** Sweep-cadence view of the stream. Hidden tabs never accelerate. */
function streamHealthyForCadence() {
  if (typeof document !== 'undefined' && document.hidden) return true
  if (!liveStream) return true
  const up = liveStream.isConnected()
  if (up) streamWasUp = true
  return up || !streamWasUp
}

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

export function feedFrozen() {
  return FROZEN
}

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
        lastStreamTs = Date.now()
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
  const derivedFromChart = !quote
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

  const prior = cache.get(symbol)
  cache.set(symbol, {
    quote,
    histo: histoBars(bars),
    tech: techBadges({ closes, volumes }, symbol === RS_BENCH ? null : benchCloses),
    ts: Date.now(),
    streamTs: prior?.streamTs ?? 0,
    // Only claim a snapshot clock when this fetch actually produced the price
    // on the row; a chart refresh behind a live stream is chart data, not a
    // new quote print.
    snapshotTs: derivedFromChart ? Date.now() : (prior?.snapshotTs ?? 0),
    overnightTs: prior?.overnightTs ?? 0,
  })
  if (derivedFromChart) lastSnapshotTs = Date.now()
  goodTs = Date.now()
  emit(symbol)
}

async function pump() {
  if (pumping) return
  pumping = true
  while (queue.length) {
    // re-read the focus set every iteration: the user can scroll mid-pump, and
    // the chart they're looking at should not wait behind the tail of the board
    const [symbol] = queue.splice(
      nextPumpIndex(queue, symbolRegistry.focused(), benchCloses ? null : RS_BENCH), 1,
    )
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

// The three clocks the UI reasons about separately: websocket prints and REST
// snapshots. `goodTs` above is the union of both and stays what it always was
// (the "updated HH:MM:SS" line); these two let the shell say WHICH pipe is
// carrying the board.
let lastStreamTs = 0
let lastSnapshotTs = 0

/** Shell-level feed inputs. Pure interpretation lives in feedHealth.js. */
export function feedStatus() {
  return {
    streamConnected: liveStream?.isConnected() ?? false,
    lastStreamTs,
    lastSnapshotTs,
  }
}

/** Per-symbol {source, receivedAt, ageMs} — 'stream' is the only live one. */
export function getFreshness(symbol, now = Date.now()) {
  return symbolFreshness(cache.get(symbol), now)
}

// Batch first paint: one v7 request prices a whole page at once, so quotes
// don't trickle in at pump spacing. The per-symbol chart pump still runs
// behind it to fill sparks. Coalesced so several track() calls in one render
// pass cost one request.
let batchTimer = null
let batchInFlight = false
const batchWanted = new Set()

function scheduleBatch(symbols) {
  for (const s of symbols) batchWanted.add(s)
  clearTimeout(batchTimer)
  batchTimer = setTimeout(runBatch, 50)
}

async function runBatch() {
  // one batch at a time, always: a sweep landing on top of a focused refresh
  // would double the in-flight request count for no fresher a print. The
  // wanted set is untouched here, so the re-armed run picks it up.
  if (batchInFlight) {
    clearTimeout(batchTimer)
    batchTimer = setTimeout(runBatch, 50)
    return
  }
  batchInFlight = true
  try {
    await drainBatch()
  } finally {
    batchInFlight = false
  }
}

async function drainBatch() {
  // on-screen rows lead, so with more symbols than fit in one request the
  // visible ones are never in chunk 2 waiting on chunk 1's round trip
  const syms = orderFocusedFirst([...batchWanted], symbolRegistry.focused())
  batchWanted.clear()
  for (let i = 0; i < syms.length; i += 40) {
    const chunk = syms.slice(i, i + 40)
    try {
      const url = `${crumbBase()}/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}`
      // no-store: an identical sweep URL must never be answered by the
      // browser's HTTP cache — that turned a 30s sweep into a 60s one
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000), cache: 'no-store' })
      reportProxyBatch(resp.ok)
      if (!resp.ok) continue // pump fills the gap one by one
      const data = await resp.json()
      const rows = data?.quoteResponse?.result || []
      if (rows.length) {
        goodTs = Date.now()
        lastSnapshotTs = Date.now()
      }
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
          // a v7 print landed for this symbol, whichever price the merge kept
          snapshotTs: Date.now(),
          overnightTs: prev?.overnightTs ?? 0,
        })
        emit(row.symbol)
      }
    } catch {
      reportProxyBatch(false) /* pump fills the gap */ }
  }
}

const tracked = new Set()
const symbolRegistry = createFeedSymbolRegistry()
// when the whole tracked set was last requested — the focused leg stands down
// inside FOCUS_SWEEP_GRACE_MS of it rather than re-asking for the same print
let lastFullSweepTs = 0

/** Both sweep legs exist to refresh TRACKED symbols. With nothing tracked
 *  they would wake a buried tab forever to look at an empty set — the last
 *  surface unmounting has to take them down, and activate() puts them back. */
function stopSweeps() {
  clearTimeout(sweepTimer)
  sweepTimer = null
  clearTimeout(fastTimer)
  fastTimer = null
}

function syncTracked() {
  const symbols = symbolRegistry.values()
  tracked.clear()
  for (const symbol of symbols) tracked.add(symbol)
  streamSymbols(symbols)
  if (!tracked.size) stopSweeps()
}

/** Symbols declared on screen AND still tracked. The intersection is what
 *  makes a leaked focus harmless: unmounting the surface drops it here. */
export function focusedSymbols() {
  return symbolRegistry.focused().filter((symbol) => tracked.has(symbol))
}

function fullSweep() {
  lastFullSweepTs = Date.now()
  scheduleBatch([...tracked])
}

/** The focused leg: at most ONE extra v7 request per tick, never while hidden,
 *  never on top of a full sweep, and never near the overnight sidecar. */
function fastSweep() {
  const focused = focusedSymbols()
  const go = shouldFastSweep({
    intervalMs: fastSweepIntervalMs(marketState().state),
    focusedCount: focused.length,
    hidden: typeof document !== 'undefined' && document.hidden,
    sinceFullSweepMs: Date.now() - lastFullSweepTs,
  })
  if (!go) return
  scheduleBatch(focused.slice(0, FOCUS_MAX)) // one chunk, one request
}

/** Overnight, the wire's IBKR-backed /api/quotes fills the thin-stream gap:
 *  Yahoo's REST print freezes at 20:00 ET and the websocket only ticks names
 *  that happen to trade, while the sidecar always has the OVERNIGHT book.
 *  Wired builds only — without an endpoint this never fires. */
async function overnightSweep() {
  const base = wireServiceUrl()
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
      cache.set(sym, { ...hit, quote: merged, overnightTs: Date.now() })
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
  const wake = () => {
    if (!tracked.size) return
    liveStream?.nudge?.()          // a dead socket reconnects now, not in 30s
    fullSweep()
    setTimeout(overnightSweep, 5_000)
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    wake()
  })
  // a network flip (wifi → cellular, VPN up) drops the socket the same way
  globalThis.addEventListener?.('online', wake)
}

/** Track symbols: serve the persisted snapshot immediately, fetch only what's
 *  stale, then refresh everything on the sweep cadence. Requested symbols jump
 *  to the front of the queue — the page being looked at fills first, instead
 *  of waiting behind the sidebar's watchlist tail on a cold cache. */
function activate(symbols, register) {
  const previouslyTracked = new Set(tracked)
  const release = register(symbols)
  syncTracked()
  const priority = []
  for (const s of symbols) {
    const isNew = !previouslyTracked.has(s)
    const hit = cache.get(s)
    const stale = !hit || Date.now() - hit.ts >= REFRESH_MS
    if (stale && (isNew || queue.includes(s))) priority.push(s)
  }
  if (priority.length) {
    queue = [...priority, ...queue.filter((s) => !priority.includes(s))]
    lastFullSweepTs = Date.now()
    scheduleBatch(priority) // instant first paint; the pump follows with charts
  }
  // RS benchmark first, so badge rows can diff against it from the start.
  if (!benchCloses && queue.length && queue[0] !== RS_BENCH) {
    queue = [RS_BENCH, ...queue.filter((s) => s !== RS_BENCH)]
  }
  pump()
  hookVisibility()
  if (!sweepTimer) {
    // the fill runs AFTER each v7 batch lands: the batch's frozen 20:00
    // print would otherwise overwrite the live overnight number it just wrote
    setTimeout(overnightSweep, 5_000)
    // Self-rescheduling so the cadence follows the session (sweepIntervalMs).
    // Charts + technicals still refresh every ~REFRESH_MS of sweep time
    // whatever the price cadence is.
    let sinceCharts = 0
    const beat = () => {
      const every = sweepIntervalMs(marketState().state, isOvernight(), streamHealthyForCadence())
      sweepTimer = setTimeout(() => {
        fullSweep()
        setTimeout(overnightSweep, 5_000)
        sinceCharts += every
        if (sinceCharts >= REFRESH_MS) {
          sinceCharts = 0
          queue.push(...tracked)
          pump()
        }
        beat()
      }, every)
    }
    beat()
    // The focused leg rides its own clock so the rows on screen refresh
    // faster than the tail. When the session has no fast sweep the timer
    // still ticks — cheaply, requesting nothing — so a board left open into
    // the pre-market open picks the cadence up without a remount. It stops
    // with the sweep leg when the last tracked surface goes away.
    const fastBeat = () => {
      const every = fastSweepIntervalMs(marketState().state) || FAST_IDLE_CHECK_MS
      fastTimer = setTimeout(() => {
        fastSweep()
        fastBeat()
      }, every)
    }
    fastBeat()
  }
  return release
}

/** Mounted quote surfaces are live only while mounted. The newest surface is
 *  ordered first, which keeps a selected custom dashboard ahead of old routes
 *  instead of growing one session-long WebSocket subscription forever. */
export function follow(symbols) {
  const release = activate(symbols, (items) => symbolRegistry.retain(items))
  return () => {
    release()
    syncTracked()
  }
}

/**
 * Declare which of the tracked symbols are on screen — the rows inside the
 * viewport, the open research symbol. Focus never adds or removes symbols from
 * the feed; it decides who goes first:
 *
 *   - the v7 batch chunks focused symbols into the FIRST request
 *   - the per-symbol chart pump dequeues them ahead of the rest
 *   - they get their own faster sweep while a session is printing
 *   - a row entering the set with a quote older than the current sweep is
 *     requested immediately, coalesced into the existing 50ms batch window
 *
 * Mirrors follow(): call it with the visible list, call the returned release
 * when it changes or the surface unmounts.
 */
export function focus(symbols) {
  const list = [...new Set((symbols || []).filter(Boolean))]
  if (!list.length) return () => {}
  const before = new Set(symbolRegistry.focused())
  const release = symbolRegistry.focus(list)
  syncTracked() // re-order the tracked set (and the stream list) behind them
  // Scroll-in freshness — only rows ENTERING the set, so a surface that
  // re-declares the same viewport every frame costs nothing.
  const entering = list.filter((symbol) => !before.has(symbol))
  const stale = staleFocusSymbols(
    entering,
    (symbol) => cache.get(symbol),
    sweepIntervalMs(marketState().state, isOvernight(), streamHealthyForCadence()),
  )
  if (stale.length) scheduleBatch(stale.slice(0, FOCUS_MAX))
  return () => {
    release()
    syncTracked()
  }
}

/** Persistent tracking is reserved for app-level consumers such as alerts. */
export function track(symbols) {
  activate(symbols, (items) => {
    symbolRegistry.persist(items)
    return () => {}
  })
}
