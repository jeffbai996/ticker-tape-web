import { beforeEach, describe, expect, it } from 'vitest'
import { groupDashboardRows, selectFlatRows, quoteSpread } from '../../src/lib/dashboardRows.js'

beforeEach(() => localStorage.clear())

describe('dashboard categories', () => {
  it('recognizes SNDK as a semiconductor from the built-in universe', () => {
    expect(groupDashboardRows(['SNDK']))
      .toEqual([{ name: 'Semis', symbols: ['SNDK'] }])
  })

  it('uses configured groups before the built-in universe', () => {
    expect(groupDashboardRows(['AAPL', 'XYZ'], { Custom: ['XYZ'] }))
      .toEqual([
        { name: 'Custom', symbols: ['XYZ'] },
        { name: 'Megacaps', symbols: ['AAPL'] },
      ])
  })
})

describe('flat dashboard rows', () => {
  const quotes = {
    AAPL: { quote: { name: 'Apple Inc.', price: 200, pct: 1, bid: 199.98, ask: 200.02 } },
    MSFT: { quote: { name: 'Microsoft Corp.', price: 400, pct: -2, bid: 399.9, ask: 400.1 } },
    NVDA: { quote: { name: 'NVIDIA Corp.', price: 150, pct: 3, bid: 149.99, ask: 150 } },
  }

  it('keeps saved order and filters by ticker or company name', () => {
    expect(selectFlatRows(['MSFT', 'AAPL', 'NVDA'], quotes).map((r) => r.symbol))
      .toEqual(['MSFT', 'AAPL', 'NVDA'])
    expect(selectFlatRows(['MSFT', 'AAPL'], quotes, { filter: 'apple' }).map((r) => r.symbol))
      .toEqual(['AAPL'])
  })

  it('sorts by symbol, move, price, and raw bid-ask spread', () => {
    const syms = ['MSFT', 'AAPL', 'NVDA']
    expect(selectFlatRows(syms, quotes, { sort: 'symbol' }).map((r) => r.symbol)).toEqual(['AAPL', 'MSFT', 'NVDA'])
    expect(selectFlatRows(syms, quotes, { sort: 'change' }).map((r) => r.symbol)).toEqual(['NVDA', 'AAPL', 'MSFT'])
    expect(selectFlatRows(syms, quotes, { sort: 'price' }).map((r) => r.symbol)).toEqual(['MSFT', 'AAPL', 'NVDA'])
    expect(selectFlatRows(syms, quotes, { sort: 'spread' }).map((r) => r.symbol)).toEqual(['MSFT', 'AAPL', 'NVDA'])
    expect(quoteSpread(quotes.AAPL.quote)).toBeCloseTo(0.04)
  })
})
