import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearWatchlistCapability, createWatchlistCapability, getWatchlistCapability,
  saveWatchlistCapability, validWatchlistCapability, watchlistSyncEndpoint,
  watchlistSyncHeaders,
} from '../../src/lib/watchlistSync.js'

describe('public watchlist sync capability', () => {
  beforeEach(() => localStorage.clear())

  it('creates a random 128-bit capability and persists only when asked', () => {
    const crypto = { getRandomValues: (bytes) => bytes.fill(0xab) }
    const token = createWatchlistCapability(crypto)
    expect(token).toBe('abababababababababababababababab')
    expect(validWatchlistCapability(token)).toBe(true)
    expect(getWatchlistCapability()).toBe('')
    expect(saveWatchlistCapability(token)).toBe(token)
    expect(getWatchlistCapability()).toBe(token)
  })

  it('rejects malformed capabilities rather than building a URL from them', () => {
    expect(saveWatchlistCapability('nope')).toBe('')
    expect(watchlistSyncEndpoint('nope')).toBe('')
  })

  it('disconnects sync without touching local watchlist storage', () => {
    localStorage.setItem('watchlist_v1', JSON.stringify(['AAPL']))
    saveWatchlistCapability('0'.repeat(32))
    clearWatchlistCapability()
    expect(getWatchlistCapability()).toBe('')
    expect(JSON.parse(localStorage.getItem('watchlist_v1'))).toEqual(['AAPL'])
  })

  it('keeps the capability in an authorization header, never the URL', () => {
    const token = '0'.repeat(32)
    expect(watchlistSyncEndpoint(token, 'https://worker.test/')).toBe('https://worker.test/watchlists')
    expect(watchlistSyncHeaders(token)).toEqual({ Authorization: `Bearer ${token}` })
    expect(watchlistSyncEndpoint(token, 'https://worker.test/')).not.toContain(token)
    expect(watchlistSyncHeaders('bad')).toEqual({})
  })
})
