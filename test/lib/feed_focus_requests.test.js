// The request side of on-screen-first data, exercised against the real feed
// module with fake timers and a fake proxy: which symbols ride the first v7
// chunk, what a focus entry costs, and — the part that has to be provable —
// how many requests ten minutes of a live board actually issues.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const BOARD = Array.from({ length: 60 }, (_, i) => `SYM${String(i).padStart(2, '0')}`)
const VISIBLE = BOARD.slice(44, 56) // a scrolled-down viewport: 12 rows

// Tuesday 13:00 ET — regular hours. Ten minutes of simulation stays inside
// the session, so the cadence never changes mid-run.
const OPEN = new Date('2026-08-18T17:00:00Z')
// Saturday 13:00 ET — closed, not overnight: no fast sweep at all.
const WEEKEND = new Date('2026-08-15T17:00:00Z')

let sockets = []

class FakeSocket {
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    sockets.push(this)
    setTimeout(() => { this.readyState = 1; this.onopen?.() }, 0)
  }

  send(payload) { this.sent.push(payload) }
  close() { this.readyState = 3; this.onclose?.() }
}

let quoteUrls = []
let chartCount = 0
let inflight = 0
let maxInflight = 0
let missing = new Set()

function chartBody(symbol) {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i)
  return {
    chart: {
      result: [{
        meta: {
          longName: `${symbol} Inc.`, regularMarketPrice: 129,
          previousClose: 128, instrumentType: 'EQUITY',
        },
        timestamp: closes.map((_, i) => 1_700_000_000 + i * 86_400),
        indicators: {
          quote: [{
            close: closes, open: closes, high: closes, low: closes,
            volume: closes.map(() => 1_000_000),
          }],
        },
      }],
    },
  }
}

/** Symbols carried by one /v7/finance/quote request. */
function chunkOf(url) {
  return decodeURIComponent(String(url).split('symbols=')[1] || '').split(',').filter(Boolean)
}

function installFetch() {
  globalThis.fetch = vi.fn(async (url) => {
    const href = String(url)
    if (href.includes('/v7/finance/quote')) {
      quoteUrls.push(href)
      inflight += 1
      maxInflight = Math.max(maxInflight, inflight)
      await Promise.resolve() // let any overlapping batch become visible
      const symbols = chunkOf(href).filter((s) => !missing.has(s))
      return {
        ok: true,
        status: 200,
        json: async () => {
          inflight -= 1
          return {
            quoteResponse: {
              result: symbols.map((symbol) => ({
                symbol,
                longName: `${symbol} Inc.`,
                regularMarketPrice: 190,
                regularMarketPreviousClose: 188,
                marketState: 'REGULAR',
              })),
            },
          }
        },
      }
    }
    if (href.includes('/v8/finance/chart/')) {
      chartCount += 1
      const symbol = decodeURIComponent(href.split('/chart/')[1].split('?')[0])
      if (missing.has(symbol)) return { ok: false, status: 502, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => chartBody(symbol) }
    }
    return { ok: false, status: 404, json: async () => ({}) }
  })
}

async function loadFeed() {
  vi.resetModules()
  return import('../../src/lib/feed.js')
}

beforeEach(() => {
  sockets = []
  quoteUrls = []
  chartCount = 0
  inflight = 0
  maxInflight = 0
  missing = new Set()
  localStorage.clear()
  globalThis.WebSocket = FakeSocket
  installFetch()
  vi.useFakeTimers()
  vi.setSystemTime(OPEN)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('focused symbols ride the first chunk', () => {
  it('keeps a scrolled-to viewport out of chunk 2 of the full sweep', async () => {
    vi.setSystemTime(WEEKEND) // closed: the full sweep is the only traffic
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    await vi.advanceTimersByTimeAsync(500)
    const unfocus = feed.focus(VISIBLE)

    quoteUrls = []
    await vi.advanceTimersByTimeAsync(120_500) // one closed-session sweep
    const chunks = quoteUrls.map(chunkOf)
    expect(chunks).toHaveLength(2) // 60 symbols, 40 per request
    expect(chunks[0]).toHaveLength(40)
    for (const symbol of VISIBLE) expect(chunks[0]).toContain(symbol)
    for (const symbol of VISIBLE) expect(chunks[1]).not.toContain(symbol)

    unfocus()
    unfollow()
  })

  it('dequeues focused symbols from the chart pump before the rest', async () => {
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    const unfocus = feed.focus(VISIBLE)
    // the pump runs three lanes and starts with the RS benchmark; every
    // symbol it touches until the visible set is exhausted must be a
    // visible one — the board's tail only starts once they are all in
    await vi.advanceTimersByTimeAsync(350 * 6)
    const fetched = globalThis.fetch.mock.calls
      .map(([url]) => String(url))
      .filter((u) => u.includes('/v8/finance/chart/'))
      .map((u) => decodeURIComponent(u.split('/chart/')[1].split('?')[0]))
    expect(fetched.length).toBeGreaterThan(3)
    for (const symbol of fetched.slice(1, VISIBLE.length + 1)) expect(VISIBLE).toContain(symbol)

    unfocus()
    unfollow()
  })
})

describe('scroll-in freshness', () => {
  it('fetches a focused row whose quote is missing, in the existing 50ms window', async () => {
    missing = new Set(['SYM50', 'SYM51']) // the proxy never priced these
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    await vi.advanceTimersByTimeAsync(1_000)

    quoteUrls = []
    const unfocus = feed.focus(VISIBLE) // rows 44..55 scroll into view
    expect(quoteUrls).toHaveLength(0)   // coalesced, not fired inline
    await vi.advanceTimersByTimeAsync(60)
    expect(quoteUrls).toHaveLength(1)
    expect(chunkOf(quoteUrls[0])).toEqual(['SYM50', 'SYM51'])

    unfocus()
    unfollow()
  })

  it('spends nothing when the entering rows were just swept', async () => {
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    await vi.advanceTimersByTimeAsync(1_000)

    quoteUrls = []
    const unfocus = feed.focus(VISIBLE)
    await vi.advanceTimersByTimeAsync(100)
    expect(quoteUrls).toHaveLength(0)
    // re-declaring the same viewport (every scroll frame) is free too
    const again = feed.focus(VISIBLE)
    await vi.advanceTimersByTimeAsync(100)
    expect(quoteUrls).toHaveLength(0)

    again()
    unfocus()
    unfollow()
  })
})

describe('ten minutes of a live board — the request budget', () => {
  const TEN_MIN = 600_000
  const FLUSH = 100 // the 50ms coalescing window of the last sweep in range

  /** Budget, regular hours, 60 tracked symbols (2 chunks of 40 + 20):
   *   first paint            1 sweep  x 2 = 2
   *   full sweep every 30s  20 sweeps x 2 = 40
   *   focused sweep every 10s, skipped within 3s of a full sweep:
   *                         60 ticks - 20 collisions x 1 = 40
   *   ---------------------------------------------------------------
   *   with a viewport declared            = 82 exactly (8.2 req/min)
   *   without one                         = 42 exactly (4.2 req/min) */
  const BASE = 42
  const WITH_FOCUS = 82

  it('costs exactly the pre-focus budget when nothing is focused', async () => {
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    await vi.advanceTimersByTimeAsync(TEN_MIN + FLUSH)

    expect(quoteUrls).toHaveLength(BASE)
    // every request is a full-sweep chunk: no single-symbol-set extra leg
    for (const url of quoteUrls) expect(chunkOf(url).length).toBeGreaterThan(19)
    expect(maxInflight).toBe(1)
    unfollow()
  })

  it('adds exactly one extra request per focused tick and no more', async () => {
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    const unfocus = feed.focus(VISIBLE)
    await vi.advanceTimersByTimeAsync(TEN_MIN + FLUSH)

    expect(quoteUrls.length).toBeGreaterThan(BASE) // the fast sweep is real
    expect(quoteUrls.length).toBe(WITH_FOCUS)
    expect(quoteUrls.length / (TEN_MIN / 60_000)).toBeLessThanOrEqual(9)
    // never more than one batch in flight, whatever the timers do
    expect(maxInflight).toBe(1)
    for (const url of quoteUrls) {
      const chunk = chunkOf(url)
      expect(chunk.length).toBeLessThanOrEqual(40) // per-request cap holds
      // the 20-symbol tail chunk must never carry a visible row
      if (chunk.length === 20) for (const s of VISIBLE) expect(chunk).not.toContain(s)
    }
    // the chart pump keeps its 350ms spacing: 600s / 350ms is the ceiling
    expect(chartCount).toBeLessThanOrEqual(Math.floor(TEN_MIN / 350) + 1)

    unfocus()
    unfollow()
  })

  it('runs no fast sweep while the tab is hidden', async () => {
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    const unfocus = feed.focus(VISIBLE)
    await vi.advanceTimersByTimeAsync(1_000)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })

    quoteUrls = []
    await vi.advanceTimersByTimeAsync(28_000) // two fast ticks, no full sweep yet
    expect(quoteUrls).toHaveLength(0)

    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    quoteUrls = []
    await vi.advanceTimersByTimeAsync(12_000) // the 30s full sweep, then a fast tick
    const sizes = quoteUrls.map((url) => chunkOf(url).length)
    expect(sizes).toContain(VISIBLE.length) // the focused-only request is back

    unfocus()
    unfollow()
  })

  it('stops the fast sweep the moment the viewport is released', async () => {
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    const unfocus = feed.focus(VISIBLE)
    await vi.advanceTimersByTimeAsync(11_000) // first paint + one fast tick
    expect(quoteUrls.map((url) => chunkOf(url).length)).toContain(VISIBLE.length)
    unfocus()

    quoteUrls = []
    await vi.advanceTimersByTimeAsync(18_000) // fast ticks, still no full sweep
    expect(quoteUrls).toHaveLength(0)
    unfollow()
  })

  it('never touches the overnight sidecar leg from the fast sweep', async () => {
    const feed = await loadFeed()
    const unfollow = feed.follow(BOARD)
    const unfocus = feed.focus(VISIBLE)
    await vi.advanceTimersByTimeAsync(TEN_MIN + FLUSH)
    const other = globalThis.fetch.mock.calls
      .map(([url]) => String(url))
      .filter((u) => !u.includes('/v7/finance/quote') && !u.includes('/v8/finance/chart/'))
    expect(other).toEqual([])
    unfocus()
    unfollow()
  })
})
