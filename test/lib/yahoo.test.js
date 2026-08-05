import { describe, it, expect } from 'vitest'
import {
  mergeSnapshotQuote, quoteFromChart, quoteFromStream, sparkFromChart,
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
    expect(q).toMatchObject({ extLabel: 'PRE', extPrice: 101, extPct: 1 })
  })

  it('uses the after-hours quote during POST', async () => {
    const { quoteFromV7 } = await import('../../src/lib/yahoo.js')
    const q = quoteFromV7({
      symbol: 'AAPL', marketState: 'POST', regularMarketPrice: 100,
      preMarketPrice: 101, preMarketChangePercent: 1,
      postMarketPrice: 102, postMarketChangePercent: 2,
    })
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
    expect(pre).toMatchObject({ price: 100, extLabel: 'PRE', extPrice: 101, extPct: 2 })

    const post = quoteFromStream({
      symbol: 'AAPL', price: 98, changePercent: -1, time: 102_000, marketHours: 2,
    }, previous)
    expect(post).toMatchObject({ price: 100, extLabel: 'AH', extPrice: 98, extPct: -1 })
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
    expect(mergeSnapshotQuote(streamed, snapshot, false)).toEqual(snapshot)
  })
})
