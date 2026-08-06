import { beforeEach, describe, expect, it } from 'vitest'
import { moveInList } from '../../src/lib/watchorder.js'
import { getWatchlist, moveSymbol, placeSymbol, watch } from '../../src/lib/watchlist.js'

describe('moveInList', () => {
  const LIST = ['A', 'B', 'C', 'D']

  it('nudges a symbol by a delta', () => {
    expect(moveInList(LIST, 'C', -1)).toEqual(['A', 'C', 'B', 'D'])
    expect(moveInList(LIST, 'B', 1)).toEqual(['A', 'C', 'B', 'D'])
  })

  it('clamps at the edges instead of wrapping', () => {
    expect(moveInList(LIST, 'A', -1)).toEqual(LIST)
    expect(moveInList(LIST, 'D', 5)).toEqual(['A', 'B', 'C', 'D'])
  })

  it("drops a symbol at another symbol's slot (drag target)", () => {
    expect(moveInList(LIST, 'D', { before: 'B' })).toEqual(['A', 'D', 'B', 'C'])
    expect(moveInList(LIST, 'A', { before: 'D' })).toEqual(['B', 'C', 'A', 'D'])
  })

  it('is a no-op for unknown symbols and never mutates', () => {
    const copy = [...LIST]
    expect(moveInList(copy, 'X', 1)).toEqual(LIST)
    expect(moveInList(copy, 'A', { before: 'X' })).toEqual(LIST)
    expect(copy).toEqual(LIST)
  })
})

describe('watchlist persistence', () => {
  beforeEach(() => localStorage.clear())

  it('moveSymbol persists the nudge', () => {
    watch('AAA'); watch('BBB'); watch('CCC')
    const before = getWatchlist()
    moveSymbol('CCC', -1)
    const after = getWatchlist()
    expect(after.indexOf('CCC')).toBe(before.indexOf('CCC') - 1)
  })

  it('placeSymbol persists a drag drop', () => {
    watch('AAA'); watch('BBB'); watch('CCC')
    placeSymbol('CCC', 'AAA')
    expect(getWatchlist().indexOf('CCC')).toBeLessThan(getWatchlist().indexOf('AAA'))
  })
})
