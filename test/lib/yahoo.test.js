import { describe, it, expect } from 'vitest'
import {
  barsFromChart, mergeSnapshotQuote, quoteFromChart, quoteFromStream,
  quoteFromV7 as v7, sparkFromChart,
} from '../../src/lib/yahoo.js'

// Shape mirrors Yahoo v8 /finance/chart responses (result[0]).
function chartResult(overrides = {}) {
  return {
    meta: {
      symbol: 'AAPL',
      shortName: 'Apple Inc.',
      regularMarketPrice: 110,
      previousClose: 100,
      chartPreviousClose: 100,
      regularMarketDayHigh: 112,
      regularMarketDayLow: 99,
      regularMarketVolume: 50_000_000,
      regularMarketTime: 1_783_022_401,
      ...overrides.meta,
    },
    timestamp: overrides.timestamp ?? [1, 2, 3, 4],
    indicators: {
      quote: [{ close: overrides.close ?? [100, 105, null, 110] }],
    },
  }
}

describe('quoteFromChart', () => {
  it('derives change and percent from previous close', () => {
    const q = quoteFromChart(chartResult())
    expect(q.symbol).toBe('AAPL')
    expect(q.price).toBe(110)
    expect(q.change).toBe(10)
    expect(q.pct).toBeCloseTo(10.0)
  })

  it('handles a negative move', () => {
    const q = quoteFromChart(chartResult({ meta: { regularMarketPrice: 95 } }))
    expect(q.change).toBe(-5)
    expect(q.pct).toBeCloseTo(-5.0)
  })

  it('falls back to chartPreviousClose when previousClose is missing', () => {
    const q = quoteFromChart(
      chartResult({ meta: { previousClose: undefined, chartPreviousClose: 200, regularMarketPrice: 210 } }),
    )
    expect(q.change).toBe(10)
    expect(q.pct).toBeCloseTo(5.0)
  })

  it('returns zero change when previous close is unknown', () => {
    const q = quoteFromChart(
      chartResult({ meta: { previousClose: undefined, chartPreviousClose: undefined } }),
    )
    expect(q.change).toBe(0)
    expect(q.pct).toBe(0)
  })

  it('survives a missing price without NaN', () => {
    const q = quoteFromChart(chartResult({ meta: { regularMarketPrice: undefined } }))
    expect(q.price).toBe(0)
    expect(Number.isNaN(q.pct)).toBe(false)
  })

  it('carries name, volume, and day range through', () => {
    const q = quoteFromChart(chartResult())
    expect(q.name).toBe('Apple Inc.')
    expect(q.volume).toBe(50_000_000)
    expect(q.dayHigh).toBe(112)
    expect(q.dayLow).toBe(99)
  })
})

describe('sparkFromChart', () => {
  it('extracts closes and drops null gaps', () => {
    expect(sparkFromChart(chartResult())).toEqual([100, 105, 110])
  })

  it('returns an empty array when indicators are missing', () => {
    expect(sparkFromChart({ meta: {} })).toEqual([])
  })
})

describe('quoteFromV7', () => {
  it('maps a v7 quote row onto the chart-quote shape', async () => {
    const { quoteFromV7 } = await import('../../src/lib/yahoo.js')
    const q = quoteFromV7({
      symbol: 'MSFT', shortName: 'Microsoft Corporation',
      regularMarketPrice: 390.49, regularMarketChange: 6.21,
      regularMarketChangePercent: 1.616, regularMarketVolume: 40690198,
      regularMarketDayHigh: 392.19, regularMarketDayLow: 383.7,
      bid: 390.45, ask: 390.52,
    })
    expect(q.symbol).toBe('MSFT')
    expect(q.name).toBe('Microsoft Corporation')
    expect(q.price).toBeCloseTo(390.49)
    expect(q.pct).toBeCloseTo(1.616)
    expect(q.volume).toBe(40690198)
    expect(q.bid).toBe(390.45)
    expect(q.ask).toBe(390.52)
  })

  it('re-derives change from prevClose — v7 yield-index rows lie', async () => {
    const { quoteFromV7 } = await import('../../src/lib/yahoo.js')
    const q = quoteFromV7({
      symbol: '^TNX', regularMarketPrice: 4.485, regularMarketPreviousClose: 4.485,
      regularMarketChange: -4.485, regularMarketChangePercent: -50,
    })
    expect(q.change).toBeCloseTo(0)
    expect(q.pct).toBeCloseTo(0)
  })

  it('uses the pre-market quote during PRE even when stale AH fields remain', async () => {
    const { quoteFromV7 } = await import('../../src/lib/yahoo.js')
    const q = quoteFromV7({
      symbol: 'AAPL', marketState: 'PRE', regularMarketPrice: 100,
      preMarketPrice: 101, preMarketChangePercent: 1,
      postMarketPrice: 99, postMarketChangePercent: -1,
    })
    expect(q).toMatchObject({ extLabel: 'PM', extPrice: 101, extPct: 1 })
  })

  it('uses the after-hours quote during POST', async () => {
    const { quoteFromV7 } = await import('../../src/lib/yahoo.js')
    const q = quoteFromV7({
      symbol: 'AAPL', marketState: 'POST', regularMarketPrice: 100,
      preMarketPrice: 101, preMarketChangePercent: 1,
      postMarketPrice: 102, postMarketChangePercent: 2,
    }, new Date('2026-08-05T17:30:00-04:00'))   // inside the AH window
    expect(q).toMatchObject({ extLabel: 'AH', extPrice: 102, extPct: 2 })
  })

  it('does not surface stale extended-hours fields during REGULAR', async () => {
    const { quoteFromV7 } = await import('../../src/lib/yahoo.js')
    const q = quoteFromV7({
      symbol: 'AAPL', marketState: 'REGULAR', regularMarketPrice: 100,
      preMarketPrice: 101, postMarketPrice: 102,
    })
    expect(q.extLabel).toBeUndefined()
    expect(q.extPrice).toBeUndefined()
  })

  it('degrades to safe defaults on an empty row', async () => {
    const { quoteFromV7 } = await import('../../src/lib/yahoo.js')
    const q = quoteFromV7(null)
    expect(q.price).toBe(0)
    expect(q.dayHigh).toBeNull()
  })
})

describe('quoteFromStream', () => {
  const previous = {
    symbol: 'AAPL', name: 'Apple Inc.', price: 100, change: 1, pct: 1,
    prevClose: 99, dayHigh: 102, dayLow: 98, volume: 1_000,
    marketTime: 100,
  }

  it('updates a regular-session quote while preserving snapshot metadata', () => {
    const q = quoteFromStream({
      symbol: 'AAPL', price: 101.5, change: 2.5, changePercent: 2.525,
      dayVolume: 1_250, time: 101_000, marketHours: 1,
    }, previous)
    expect(q).toMatchObject({
      symbol: 'AAPL', name: 'Apple Inc.', price: 101.5, change: 2.5,
      pct: 2.525, volume: 1_250, dayHigh: 102, dayLow: 98,
      marketTime: 101,
    })
    expect(q.extLabel).toBeUndefined()
  })

  it('routes pre/post ticks into the extended-hours quote', () => {
    const pre = quoteFromStream({
      symbol: 'AAPL', price: 101, changePercent: 2, time: 101_000, marketHours: 0,
    }, previous)
    expect(pre).toMatchObject({ price: 100, extLabel: 'PM', extPrice: 101, extPct: 2 })

    const post = quoteFromStream({
      symbol: 'AAPL', price: 98, changePercent: -1, time: 102_000, marketHours: 2,
    }, previous)
    expect(post).toMatchObject({ price: 100, extLabel: 'AH', extPrice: 98, extPct: -1 })
  })

  it('labels Yahoo overnight-session ticks separately from after-hours', () => {
    const overnight = quoteFromStream({
      symbol: 'AAPL', price: 100.5, changePercent: 0.5, time: 103_000, marketHours: 4,
    }, previous)
    expect(overnight).toMatchObject({ price: 100, extLabel: 'ON', extPrice: 100.5, extPct: 0.5 })
  })
})

describe('mergeSnapshotQuote', () => {
  it('does not let a fallback snapshot overwrite a fresher streamed print', () => {
    const streamed = {
      symbol: 'AAPL', name: 'Apple Inc.', price: 101.5, change: 2.5,
      pct: 2.525, volume: 1_250, marketTime: 101, bid: 101.48, ask: 101.52,
    }
    const snapshot = {
      symbol: 'AAPL', name: 'Apple Inc.', price: 100, change: 1, pct: 1,
      volume: 1_000, dayHigh: 103, dayLow: 98, marketTime: 100,
      bid: 99.98, ask: 100.02,
    }
    expect(mergeSnapshotQuote(streamed, snapshot, true)).toMatchObject({
      price: 101.5, change: 2.5, pct: 2.525, volume: 1_250,
      marketTime: 101, dayHigh: 103, bid: 101.48, ask: 101.52,
    })
    // 2026-08-06: even with the stream stale, a snapshot whose EVENT TIME is
    // older must not repaint a newer print — that's the red-flash-on-a-rising-
    // tape bug. The old contract (stale stream → snapshot wins outright) only
    // holds when the snapshot is actually newer.
    expect(mergeSnapshotQuote(streamed, snapshot, false).price).toBe(101.5)
    const newer = { ...snapshot, marketTime: 102 }
    expect(mergeSnapshotQuote(streamed, newer, false)).toEqual(newer)
  })
})

describe('quoteFromV7 extended-session label', () => {
  const quoteFromV7 = (...args) => v7(...args)
  const row = {
    symbol: 'AAPL', regularMarketPrice: 311, regularMarketPreviousClose: 309.38,
    marketState: 'POSTPOST', postMarketPrice: 312.5, postMarketChangePercent: 0.48,
  }

  it('is AH inside the after-hours session', () => {
    expect(quoteFromV7(row, new Date('2026-08-05T18:30:00-04:00')).extLabel).toBe('AH')
  })

  // v7 has no overnight field — postMarketPrice freezes at the 20:00 print, so
  // the clock is what names the session and first paint stops churning
  it('is ON once the overnight session has taken over', () => {
    const q = quoteFromV7(row, new Date('2026-08-06T00:05:00-04:00'))
    expect(q.extLabel).toBe('ON')
    expect(q.extPrice).toBe(312.5)
  })

  it('is AH again over the weekend, when nothing trades overnight', () => {
    expect(quoteFromV7(row, new Date('2026-08-08T02:00:00-04:00')).extLabel).toBe('AH')
  })
})

describe('out-of-order prints never move the tape backwards', () => {
  // The REST batch often reports an event older than the stream tick already
  // painted; replacing it flashed red on a rising tape (Jeff 2026-08-06).
  const prev = { symbol: 'NVDA', name: 'NVIDIA', price: 222.58, change: 10.64,
                 pct: 5.02, volume: 100, marketTime: 1_000_100 }

  it('batch snapshot with an older event time keeps the newer price', () => {
    const snap = { symbol: 'NVDA', name: 'NVIDIA', price: 222.51, change: 10.57,
                   pct: 4.99, volume: 99, marketTime: 1_000_040 }
    const out = mergeSnapshotQuote(prev, snap, false)
    expect(out.price).toBe(222.58)
    expect(out.pct).toBe(5.02)
  })

  it('batch snapshot with a newer event time still wins when the stream is stale', () => {
    const snap = { symbol: 'NVDA', name: 'NVIDIA', price: 222.70, change: 10.76,
                   pct: 5.08, volume: 101, marketTime: 1_000_200 }
    expect(mergeSnapshotQuote(prev, snap, false).price).toBe(222.70)
  })

  // Overnight the tape is thin: most names go quiet for well over the 90s
  // stream-freshness window, and v7 has no overnight field at all — its
  // postMarketPrice is the frozen 20:00 print with no event time of its own.
  // Letting that snapshot win yanked every silent row back to the close on
  // the same 30s batch, then jumped it forward again on the next tick.
  it('a quiet overnight row keeps its live ON print over the frozen batch print', () => {
    const live = { symbol: 'NVDA', name: 'NVIDIA', price: 222.58, marketTime: 1_000_100,
                   extLabel: 'ON', extPrice: 219.55, extPct: 1.1, extMarketTime: 1_000_900 }
    const snap = { symbol: 'NVDA', name: 'NVIDIA', price: 222.58, marketTime: 1_000_100,
                   extLabel: 'ON', extPrice: 217.20, extPct: -0.4 }
    const out = mergeSnapshotQuote(live, snap, false)
    expect(out.extPrice).toBe(219.55)
    expect(out.extPct).toBe(1.1)
    expect(out.extMarketTime).toBe(1_000_900)
  })

  it('still takes the batch ext print when the stream never supplied one', () => {
    const noExt = { symbol: 'NVDA', name: 'NVIDIA', price: 222.58, marketTime: 1_000_100 }
    const snap = { symbol: 'NVDA', name: 'NVIDIA', price: 222.58, marketTime: 1_000_100,
                   extLabel: 'ON', extPrice: 217.20, extPct: -0.4 }
    expect(mergeSnapshotQuote(noExt, snap, false).extPrice).toBe(217.20)
  })

  it('a late stream tick with an older event time is dropped', () => {
    const out = quoteFromStream(
      { symbol: 'NVDA', price: 222.40, time: 1_000_000_000, marketHours: 1 },
      prev,
    )
    expect(out.price).toBe(222.58)
  })

  it('a fresh stream tick still paints', () => {
    const out = quoteFromStream(
      { symbol: 'NVDA', price: 222.61, time: 1_000_200_000, marketHours: 1 },
      prev,
    )
    expect(out.price).toBe(222.61)
  })
})

describe('barsFromChart bad-print scrub', () => {
  it('drops zero-volume bars whose wick spans absurdly beyond their neighbours (MU 2026-08-17 14:18–14:24 PT: Yahoo v8 lows of 485–662 on a 1010 stock, volume 0)', () => {
    const closes = [1010.1, 1010.2, 1010.4, 1010.35, 1009.99, 1010.5, 1010.7]
    const result = {
      timestamp: [1, 2, 3, 4, 5, 6, 7],
      indicators: { quote: [{
        open:   [1010.0, 1010.1, 1010.25, 485.86, 526.77, 1010.4, 1010.6],
        high:   [1010.5, 1293.69, 1010.4, 1010.58, 1010.55, 1010.9, 1011.0],
        low:    [1009.8, 662.52, 582.80, 485.86, 526.77, 1010.1, 1010.3],
        close:  closes,
        volume: [1200, 0, 0, 0, 0, 900, 1100],
      }] },
    }
    const bars = barsFromChart(result)
    // the four bad prints are gone; the honest bars survive with their order
    expect(bars.map((b) => b.time)).toEqual([1, 6, 7])
    expect(bars[0].low).toBe(1009.8)
  })

  it('keeps zero-volume bars whose range is ordinary (pre/post-market prints legitimately show volume 0)', () => {
    const result = {
      timestamp: [1, 2, 3],
      indicators: { quote: [{
        open: [100, 100.2, 100.1], high: [100.5, 100.6, 100.4], low: [99.8, 99.9, 99.9],
        close: [100.2, 100.1, 100.3], volume: [0, 0, 0],
      }] },
    }
    expect(barsFromChart(result)).toHaveLength(3)
  })

  it('drops isolated zero-volume extended-hours wicks before they distort the price scale', () => {
    const result = {
      timestamp: [1, 2, 3, 4, 5, 6, 7],
      indicators: { quote: [{
        open:   [481.1, 481.2, 481.3, 481.35, 481.4, 481.3, 481.2],
        high:   [481.5, 481.6, 481.7, 489.14, 481.8, 481.7, 481.6],
        low:    [480.9, 481.0, 481.1, 473.41, 481.2, 481.1, 481.0],
        close:  [481.2, 481.3, 481.4, 481.34, 481.5, 481.4, 481.3],
        volume: [900, 1100, 800, 0, 1000, 700, 1200],
      }] },
    }

    expect(barsFromChart(result).map((b) => b.time)).toEqual([1, 2, 3, 5, 6, 7])
  })

  it('keeps a zero-volume whole-bar repricing when its candle range stays tight', () => {
    const result = {
      timestamp: [1, 2, 3, 4, 5],
      indicators: { quote: [{
        open: [100, 100.1, 112, 112.1, 112.2], high: [100.4, 100.5, 112.4, 112.5, 112.6],
        low: [99.8, 99.9, 111.8, 111.9, 112], close: [100.2, 100.3, 112.2, 112.3, 112.4],
        volume: [1000, 900, 0, 0, 1200],
      }] },
    }

    expect(barsFromChart(result)).toHaveLength(5)
  })

  it('does not scrub a genuine wide-range bar that carries volume (a real gap or halt-reopen prints volume)', () => {
    const result = {
      timestamp: [1, 2, 3],
      indicators: { quote: [{
        open: [100, 100, 130], high: [100.5, 135, 131], low: [99.8, 99, 129],
        close: [100.2, 132, 130.5], volume: [1000, 900000, 5000],
      }] },
    }
    expect(barsFromChart(result)).toHaveLength(3)
  })
})
