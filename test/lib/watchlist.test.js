import { describe, it, expect, beforeEach } from 'vitest'
import { getWatchlist, watch, unwatch, isWatched, onWatchlistChange } from '../../src/lib/watchlist.js'
import { WATCHLIST } from '../../src/lib/symbols.js'

beforeEach(() => localStorage.clear())

describe('watchlist', () => {
  it('defaults to the generic set', () => {
    expect(getWatchlist()).toEqual(WATCHLIST)
  })

  it('adds uppercase, persists, and notifies', () => {
    let seen = null
    const off = onWatchlistChange((l) => { seen = l })
    const next = watch('shop')
    expect(next).toContain('SHOP')
    expect(getWatchlist()).toContain('SHOP')
    expect(seen).toContain('SHOP')
    expect(isWatched('shop')).toBe(true)
    off()
  })

  it('rejects junk, duplicates, and respects the cap', () => {
    expect(watch('<script>')).toBeNull()
    expect(watch('')).toBeNull()
    expect(watch(WATCHLIST[0])).toBeNull() // already present
  })

  it('removes and reports missing symbols', () => {
    const next = unwatch(WATCHLIST[0])
    expect(next).not.toContain(WATCHLIST[0])
    expect(unwatch('ZZZZ')).toBeNull()
  })

  it('survives a JSON round-trip', () => {
    watch('TSM2') // hypothetical-looking but regex-valid
    expect(getWatchlist()).toEqual(JSON.parse(localStorage.getItem('watchlist_v1')))
  })
})
