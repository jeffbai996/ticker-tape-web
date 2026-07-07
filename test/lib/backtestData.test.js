import { describe, it, expect, beforeEach } from 'vitest'
import { parseFillsCsv } from '../../src/lib/backtest.js'
import { demoFillsCsv, loadFillsCsv, saveFillsCsv, closesByDateFromChart } from '../../src/lib/backtestData.js'

describe('demoFillsCsv', () => {
  it('parses into a small, valid, generic ledger', () => {
    const fills = parseFillsCsv(demoFillsCsv())
    expect(fills.length).toBeGreaterThanOrEqual(6)
    expect(fills.length).toBeLessThanOrEqual(10)
    const allowed = new Set(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'SPY', 'QQQ'])
    for (const f of fills) expect(allowed.has(f.symbol)).toBe(true)
  })

  it('spans roughly two to three years', () => {
    const fills = parseFillsCsv(demoFillsCsv())
    const first = new Date(fills[0].date)
    const last = new Date(fills[fills.length - 1].date)
    const years = (last - first) / (365 * 86_400_000)
    expect(years).toBeGreaterThan(1.5)
    expect(years).toBeLessThan(3.5)
  })
})

describe('fills ledger localStorage round-trip', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when nothing has been saved', () => {
    expect(loadFillsCsv()).toBeNull()
  })

  it('saves and reloads the ledger text', () => {
    saveFillsCsv('date,symbol,side,qty,price\n2024-01-02,MSFT,BUY,1,300\n')
    expect(loadFillsCsv()).toContain('MSFT,BUY,1,300')
  })

  it('clears back to null when saved with null', () => {
    saveFillsCsv('date,symbol,side,qty,price\n2024-01-02,MSFT,BUY,1,300\n')
    saveFillsCsv(null)
    expect(loadFillsCsv()).toBeNull()
  })
})

describe('closesByDateFromChart', () => {
  it('builds a date-keyed closes map from a chart result', () => {
    const result = {
      timestamp: [1672704000, 1672790400], // 2023-01-03, 2023-01-04 UTC
      indicators: { quote: [{ close: [125.5, 126.25] }] },
    }
    const out = closesByDateFromChart(result)
    expect(out['2023-01-03']).toBe(125.5)
    expect(out['2023-01-04']).toBe(126.25)
  })

  it('drops bars with a null close instead of fabricating a price', () => {
    const result = {
      timestamp: [1672704000, 1672790400],
      indicators: { quote: [{ close: [125.5, null] }] },
    }
    const out = closesByDateFromChart(result)
    expect(Object.keys(out)).toEqual(['2023-01-03'])
  })

  it('returns {} for a missing or empty result', () => {
    expect(closesByDateFromChart(null)).toEqual({})
    expect(closesByDateFromChart({})).toEqual({})
  })
})
