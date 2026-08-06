import { describe, expect, it } from 'vitest'
import { nextSort, sortSymbols } from '../../src/lib/watchsort.js'

const QUOTES = {
  NVDA: { quote: { pct: 3.4 } },
  AAPL: { quote: { pct: -1.2 } },
  MSFT: { quote: { pct: 0.5 } },
  ZZZ: {},                            // unpriced
}
const LIST = ['NVDA', 'AAPL', 'MSFT', 'ZZZ']

describe('sortSymbols', () => {
  it('keeps the stored order when unsorted', () => {
    expect(sortSymbols(LIST, QUOTES, null)).toEqual(LIST)
  })

  it('sorts by ticker both ways', () => {
    expect(sortSymbols(LIST, QUOTES, { key: 'sym', dir: 'asc' }))
      .toEqual(['AAPL', 'MSFT', 'NVDA', 'ZZZ'])
    expect(sortSymbols(LIST, QUOTES, { key: 'sym', dir: 'desc' }))
      .toEqual(['ZZZ', 'NVDA', 'MSFT', 'AAPL'])
  })

  it('sorts by day change, biggest first on desc', () => {
    expect(sortSymbols(LIST, QUOTES, { key: 'pct', dir: 'desc' }).slice(0, 3))
      .toEqual(['NVDA', 'MSFT', 'AAPL'])
    expect(sortSymbols(LIST, QUOTES, { key: 'pct', dir: 'asc' }).slice(0, 3))
      .toEqual(['AAPL', 'MSFT', 'NVDA'])
  })

  // an unpriced row has no business jumping to the top of a % sort
  it('parks unpriced symbols at the bottom either way', () => {
    expect(sortSymbols(LIST, QUOTES, { key: 'pct', dir: 'asc' }).at(-1)).toBe('ZZZ')
    expect(sortSymbols(LIST, QUOTES, { key: 'pct', dir: 'desc' }).at(-1)).toBe('ZZZ')
  })

  it("never mutates the caller's list", () => {
    const list = [...LIST]
    sortSymbols(list, QUOTES, { key: 'sym', dir: 'asc' })
    expect(list).toEqual(LIST)
  })
})

describe('nextSort', () => {
  it('cycles a column through desc, asc, off', () => {
    expect(nextSort(null, 'pct')).toEqual({ key: 'pct', dir: 'desc' })
    expect(nextSort({ key: 'pct', dir: 'desc' }, 'pct')).toEqual({ key: 'pct', dir: 'asc' })
    expect(nextSort({ key: 'pct', dir: 'asc' }, 'pct')).toBe(null)
  })

  it('starts a different column fresh', () => {
    expect(nextSort({ key: 'pct', dir: 'asc' }, 'sym')).toEqual({ key: 'sym', dir: 'asc' })
  })
})
