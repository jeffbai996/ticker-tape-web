import { describe, it, expect, beforeEach } from 'vitest'
import {
  getWatchlist, watch, unwatch, isWatched, onWatchlistChange,
  isWatchlistFull, replaceWatchlist, MAX_WATCHLIST,
} from '../../src/lib/watchlist.js'
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

  it('reports when the list is full so a caller can say why an add failed', () => {
    // watch() returns null for invalid / duplicate / full alike; the UI needs
    // to tell "not a symbol" apart from "no room left".
    expect(isWatchlistFull()).toBe(false)
    const filler = Array.from({ length: MAX_WATCHLIST }, (_, i) => `TST${i}`)
    replaceWatchlist(filler)
    expect(getWatchlist()).toHaveLength(MAX_WATCHLIST)
    expect(isWatchlistFull()).toBe(true)
    expect(watch('NVDA')).toBeNull()
    // the module memoizes the list, so localStorage.clear() alone would leak
    // this 60-name filler into the tests that follow
    replaceWatchlist([...WATCHLIST])
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
