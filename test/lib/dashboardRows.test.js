import { beforeEach, describe, expect, it } from 'vitest'
import {
  getCategoryOverrides, onCategoryOverridesChange, setCategoryOverride,
} from '../../src/lib/categories.js'
import { groupDashboardRows, selectFlatRows, quoteSpread } from '../../src/lib/dashboardRows.js'

beforeEach(() => localStorage.clear())

describe('dashboard categories', () => {
  it('manually assigns a general ticker to a built-in category', () => {
    let seen = null
    const off = onCategoryOverridesChange((v) => { seen = v })
    expect(setCategoryOverride('xyz', 'Semis')).toBe('Semis')
    expect(getCategoryOverrides()).toEqual({ XYZ: 'Semis' })
    expect(seen).toEqual({ XYZ: 'Semis' })
    expect(groupDashboardRows(['AAPL', 'XYZ'], getCategoryOverrides()))
      .toEqual([
        { name: 'Megacaps', symbols: ['AAPL'] },
        { name: 'Semis', symbols: ['XYZ'] },
      ])
    off()
  })

  it('clears an override back to automatic categorization', () => {
    setCategoryOverride('XYZ', 'Semis')
    expect(setCategoryOverride('XYZ', null)).toBeNull()
    expect(groupDashboardRows(['XYZ'], getCategoryOverrides()))
      .toEqual([{ name: 'General', symbols: ['XYZ'] }])
  })

  it('recognizes SNDK as a semiconductor without an override', () => {
    expect(groupDashboardRows(['SNDK'], {}))
      .toEqual([{ name: 'Semis', symbols: ['SNDK'] }])
  })
})

describe('flat dashboard rows', () => {
  const quotes = {
    AAPL: { quote: { name: 'Apple Inc.', price: 200, pct: 1, bid: 199.98, ask: 200.02 } },
    MSFT: { quote: { name: 'Microsoft Corp.', price: 400, pct: -2, bid: 399.9, ask: 400.1 } },
    NVDA: { quote: { name: 'NVIDIA Corp.', price: 150, pct: 3, bid: 149.99, ask: 150 } },
  }

  it('keeps manual watchlist order and filters by ticker or company name', () => {
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
