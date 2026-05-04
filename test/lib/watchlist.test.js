import { describe, it, expect } from 'vitest'
import {
  getWatchlistFilter, setWatchlistFilter,
  addToWatchlist, removeFromWatchlist,
  loadGroups, saveGroup, deleteGroup,
} from '../../src/lib/watchlist.js'

// localStorage cleared in test/setup.js before each test

describe('getWatchlistFilter', () => {
  it('returns null when no filter set', () => {
    expect(getWatchlistFilter()).toBeNull()
  })
})

describe('setWatchlistFilter', () => {
  it('stores symbols uppercased', () => {
    setWatchlistFilter(['nvda', 'aapl'])
    expect(getWatchlistFilter()).toEqual(['NVDA', 'AAPL'])
  })
  it('clears filter for empty array', () => {
    setWatchlistFilter(['NVDA'])
    setWatchlistFilter([])
    expect(getWatchlistFilter()).toBeNull()
  })
  it('clears filter for null', () => {
    setWatchlistFilter(['NVDA'])
    setWatchlistFilter(null)
    expect(getWatchlistFilter()).toBeNull()
  })
})

describe('addToWatchlist', () => {
  it('adds symbol to empty watchlist', () => {
    addToWatchlist('NVDA')
    expect(getWatchlistFilter()).toContain('NVDA')
  })
  it('uppercases symbol', () => {
    addToWatchlist('nvda')
    expect(getWatchlistFilter()).toContain('NVDA')
  })
  it('does not add duplicate', () => {
    addToWatchlist('NVDA')
    addToWatchlist('NVDA')
    expect(getWatchlistFilter()?.filter(s => s === 'NVDA')).toHaveLength(1)
  })
  it('uppercased duplicate is also ignored', () => {
    addToWatchlist('NVDA')
    addToWatchlist('nvda')
    expect(getWatchlistFilter()?.filter(s => s === 'NVDA')).toHaveLength(1)
  })
  it('adds multiple different symbols', () => {
    addToWatchlist('NVDA')
    addToWatchlist('AAPL')
    addToWatchlist('GOOG')
    expect(getWatchlistFilter()).toHaveLength(3)
  })
})

describe('removeFromWatchlist', () => {
  it('removes existing symbol', () => {
    addToWatchlist('NVDA')
    addToWatchlist('AAPL')
    removeFromWatchlist('NVDA')
    const filter = getWatchlistFilter()
    expect(filter).not.toContain('NVDA')
    expect(filter).toContain('AAPL')
  })
  it('is case-insensitive on removal', () => {
    addToWatchlist('NVDA')
    removeFromWatchlist('nvda')
    expect(getWatchlistFilter()).not.toContain('NVDA')
  })
  it('does nothing when filter is null', () => {
    // No error should be thrown when filter is null
    expect(() => removeFromWatchlist('NVDA')).not.toThrow()
    expect(getWatchlistFilter()).toBeNull()
  })
  it('does nothing for non-existent symbol', () => {
    addToWatchlist('AAPL')
    removeFromWatchlist('NVDA')
    expect(getWatchlistFilter()).toContain('AAPL')
  })
})

describe('groups', () => {
  it('returns empty object when no groups exist', () => {
    expect(loadGroups()).toEqual({})
  })
  it('saves a group with uppercased symbols', () => {
    saveGroup('semis', ['nvda', 'amd', 'intc'])
    const groups = loadGroups()
    expect(groups['semis']).toEqual(['NVDA', 'AMD', 'INTC'])
  })
  it('overwrites existing group with same name', () => {
    saveGroup('semis', ['NVDA'])
    saveGroup('semis', ['NVDA', 'AMD'])
    expect(loadGroups()['semis']).toHaveLength(2)
  })
  it('deletes group by name', () => {
    saveGroup('semis', ['NVDA'])
    saveGroup('faang', ['AAPL', 'GOOG'])
    deleteGroup('semis')
    const groups = loadGroups()
    expect(groups['semis']).toBeUndefined()
    expect(groups['faang']).toBeDefined()
  })
  it('handles delete of non-existent group gracefully', () => {
    expect(() => deleteGroup('nonexistent')).not.toThrow()
  })
})
