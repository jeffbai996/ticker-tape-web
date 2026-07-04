import { describe, it, expect } from 'vitest'
import { quoteFromChart, sparkFromChart } from '../../src/lib/yahoo.js'

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
