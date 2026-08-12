import { beforeEach, describe, expect, it } from 'vitest'
import {
  groupDashboardRows, selectFlatRows, quoteSpread, boardBreadth, dropSlot, resolveDrop,
} from '../../src/lib/dashboardRows.js'

beforeEach(() => localStorage.clear())

describe('dashboard categories', () => {
  it('recognizes SNDK as a semiconductor from the built-in universe', () => {
    expect(groupDashboardRows(['SNDK']))
      .toEqual([{ name: 'Semis', symbols: ['SNDK'] }])
  })

  it('classifies ADM and both SK hynix listings instead of using General', () => {
    expect(groupDashboardRows(['ADM', 'SKHY', '000660.KS']))
      .toEqual([
        { name: 'Semis', symbols: ['SKHY', '000660.KS'] },
        { name: 'Staples', symbols: ['ADM'] },
      ])
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

describe('drag-to-reorder slots', () => {
  // three 20px rows stacked from the board's top edge
  const rows = [
    { symbol: 'AAPL', top: 0, bottom: 20 },
    { symbol: 'MSFT', top: 20, bottom: 40 },
    { symbol: 'NVDA', top: 40, bottom: 60 },
  ]

  it('splits each row at its midpoint and treats the tail as its own slot', () => {
    expect(dropSlot(rows, 2)).toEqual({ before: 'AAPL' })
    expect(dropSlot(rows, 9)).toEqual({ before: 'AAPL' })
    expect(dropSlot(rows, 11)).toEqual({ before: 'MSFT' })
    expect(dropSlot(rows, 39)).toEqual({ before: 'NVDA' })
    expect(dropSlot(rows, 51)).toEqual({ after: 'NVDA' })
    // above the first row is still the first slot, not "no slot"
    expect(dropSlot(rows, -40)).toEqual({ before: 'AAPL' })
    expect(dropSlot([], 10)).toBeNull()
  })

  it('resolves a slot into one placement call', () => {
    const list = ['AAPL', 'MSFT', 'NVDA', 'AMD']
    expect(resolveDrop(list, 'AMD', { before: 'MSFT' })).toEqual({ before: 'MSFT' })
    expect(resolveDrop(list, 'AAPL', { after: 'AMD' })).toEqual({ toEnd: true })
    // a group is a slice of the list: its tail row is followed by whatever
    // comes next in the WATCHLIST, which is where the drop has to land
    expect(resolveDrop(list, 'AAPL', { after: 'MSFT' })).toEqual({ before: 'NVDA' })
  })

  it('reports no-op drops instead of writing the list back unchanged', () => {
    const list = ['AAPL', 'MSFT', 'NVDA']
    expect(resolveDrop(list, 'MSFT', { before: 'MSFT' })).toBeNull()   // onto itself
    expect(resolveDrop(list, 'AAPL', { before: 'MSFT' })).toBeNull()   // already there
    expect(resolveDrop(list, 'MSFT', { after: 'AAPL' })).toBeNull()    // already there
    expect(resolveDrop(list, 'NVDA', { after: 'NVDA' })).toBeNull()    // already last
    expect(resolveDrop(list, 'GONE', { before: 'AAPL' })).toBeNull()
    expect(resolveDrop(list, 'AAPL', { before: 'GONE' })).toBeNull()
    expect(resolveDrop(list, 'AAPL', null)).toBeNull()
  })
})

describe('board breadth', () => {
  const rows = [
    { symbol: 'AAPL', pct: 1.2 },
    { symbol: 'MSFT', pct: -2.4 },
    { symbol: 'NVDA', pct: 3.1 },
    { symbol: 'SGOV', pct: 0 },
  ]

  it('counts movers and picks the extremes', () => {
    const b = boardBreadth(rows)
    expect(b.up).toBe(2)
    expect(b.down).toBe(1)
    expect(b.flat).toBe(1)
    expect(b.best).toEqual({ symbol: 'NVDA', pct: 3.1 })
    expect(b.worst).toEqual({ symbol: 'MSFT', pct: -2.4 })
  })

  it('returns null with no usable rows', () => {
    expect(boardBreadth([])).toBeNull()
    expect(boardBreadth([{ symbol: 'X', pct: null }, { symbol: 'Y' }])).toBeNull()
  })

  it('ignores rows without a pct instead of miscounting them', () => {
    const b = boardBreadth([{ symbol: 'AAPL', pct: 1 }, { symbol: 'HALT' }])
    expect(b.up).toBe(1)
    expect(b.flat).toBe(0)
  })
})
