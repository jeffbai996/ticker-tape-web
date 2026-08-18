// Behavioral cover for the live feed itself (not just its pure helpers):
// which clock each write stamps, and what the UI is therefore allowed to
// claim about a row. feed.js drives every quote surface, so the parts touched
// here — batch merge, chart fallback, stream tick — get real exercise before
// anything reads their freshness.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const AAPL = 'AAPL'

// ---- fake Yahoo websocket -------------------------------------------------

let sockets = []

class FakeSocket {
  constructor(url) {
    this.url = url
    this.readyState = 0
    this.sent = []
    sockets.push(this)
    setTimeout(() => {
      this.readyState = 1
      this.onopen?.()
    }, 0)
  }

  send(payload) { this.sent.push(payload) }

  close() {
    this.readyState = 3
    this.onclose?.()
  }
}

/** Encode the two protobuf fields the price stream actually needs. */
function pricingMessage(symbol, price, marketHours = 1) {
  const bytes = [0x0a, symbol.length, ...[...symbol].map((c) => c.charCodeAt(0))]
  const float = new DataView(new ArrayBuffer(4))
  float.setFloat32(0, price, true)
  bytes.push(0x15, ...new Uint8Array(float.buffer))
  bytes.push(0x38, marketHours)
  const binary = String.fromCharCode(...bytes)
  return JSON.stringify({ type: 'pricing', message: btoa(binary) })
}

function tick(symbol, price, marketHours = 1) {
  for (const socket of sockets) {
    socket.onmessage?.({ data: pricingMessage(symbol, price, marketHours) })
  }
}

// ---- fake proxy -----------------------------------------------------------

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

function quoteBody(symbols) {
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
}

let batchOk = true

function installFetch() {
  globalThis.fetch = vi.fn(async (url) => {
    const href = String(url)
    if (href.includes('/v7/finance/quote')) {
      if (!batchOk) return { ok: false, status: 502, json: async () => ({}) }
      const symbols = decodeURIComponent(href.split('symbols=')[1] || '').split(',')
      return { ok: true, status: 200, json: async () => quoteBody(symbols.filter(Boolean)) }
    }
    if (href.includes('/v8/finance/chart/')) {
      const symbol = decodeURIComponent(href.split('/chart/')[1].split('?')[0])
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
  batchOk = true
  localStorage.clear()
  globalThis.WebSocket = FakeSocket
  installFetch()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('feed per-symbol freshness', () => {
  it('stamps a batch row as a snapshot, never as live', async () => {
    const feed = await loadFeed()
    const release = feed.follow([AAPL])
    await vi.waitFor(() => {
      expect(feed.getCached(AAPL)?.quote?.price).toBe(190)
    }, { timeout: 3_000 })

    const fresh = feed.getFreshness(AAPL)
    expect(fresh.source).toBe('snapshot')
    expect(fresh.receivedAt).toBeGreaterThan(0)
    expect(fresh.ageMs).toBeLessThan(5_000)
    release()
  })

  it('promotes the row to stream the moment a tick prints', async () => {
    const feed = await loadFeed()
    const release = feed.follow([AAPL])
    await vi.waitFor(() => expect(sockets.length).toBeGreaterThan(0))
    await vi.waitFor(() => expect(sockets[0].readyState).toBe(1))

    tick(AAPL, 191.5)
    expect(feed.getCached(AAPL)?.quote?.price).toBeCloseTo(191.5, 2)
    expect(feed.getFreshness(AAPL).source).toBe('stream')
    release()
  })

  // the chart pump is the last resort when the batch 502s; the row it paints
  // is still a snapshot, and must say so
  it('stamps a chart-derived quote as a snapshot when the batch fails', async () => {
    batchOk = false
    const feed = await loadFeed()
    const release = feed.follow([AAPL])
    await vi.waitFor(() => {
      expect(feed.getCached(AAPL)?.quote?.price).toBe(129)
    }, { timeout: 5_000 })
    expect(feed.getFreshness(AAPL).source).toBe('snapshot')
    release()
  })

  it('reports an untracked symbol as stale with no timestamp', async () => {
    const feed = await loadFeed()
    const fresh = feed.getFreshness('MSFT')
    expect(fresh.source).toBe('stale')
    expect(fresh.receivedAt).toBe(null)
  })

  it('keeps the chart clock separate from the quote clocks', async () => {
    const feed = await loadFeed()
    const release = feed.follow([AAPL])
    await vi.waitFor(() => {
      expect(feed.getCached(AAPL)?.histo?.length).toBeGreaterThan(0)
    }, { timeout: 5_000 })
    const before = feed.getCached(AAPL).ts
    tick(AAPL, 195)
    // a price tick must not make the 1Y chart look refreshed
    expect(feed.getCached(AAPL).ts).toBe(before)
    expect(feed.getFreshness(AAPL).receivedAt).toBeGreaterThanOrEqual(before)
    release()
  })
})

describe('feedStatus', () => {
  it('reports socket connection plus both data clocks', async () => {
    const feed = await loadFeed()
    const cold = feed.feedStatus()
    expect(cold.streamConnected).toBe(false)
    expect(cold.lastSnapshotTs).toBe(0)
    expect(cold.lastStreamTs).toBe(0)

    const release = feed.follow([AAPL])
    await vi.waitFor(() => expect(feed.feedStatus().lastSnapshotTs).toBeGreaterThan(0),
      { timeout: 3_000 })
    await vi.waitFor(() => expect(feed.feedStatus().streamConnected).toBe(true))

    tick(AAPL, 191.5)
    expect(feed.feedStatus().lastStreamTs).toBeGreaterThan(0)
    release()
  })

  it('drops back to disconnected when the socket closes', async () => {
    const feed = await loadFeed()
    const release = feed.follow([AAPL])
    await vi.waitFor(() => expect(feed.feedStatus().streamConnected).toBe(true))
    sockets[0].close()
    expect(feed.feedStatus().streamConnected).toBe(false)
    release()
  })
})
