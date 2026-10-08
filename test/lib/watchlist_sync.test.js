import { beforeEach, describe, expect, it } from 'vitest'
import {
  getWatchlistCapability, validWatchlistCapability, watchlistSyncEndpoint, watchlistSyncHeaders,
} from '../../src/lib/watchlistSync.js'

describe('watchlist sync capability', () => {
  beforeEach(() => localStorage.clear())

  it('comes from the build only — a browser-stored code is never honoured', () => {
    // the visitor "sync code" path was retired 2026-08-22: the worker takes
    // exactly one token, so a typed code could only ever 401
    localStorage.setItem('watchlist_sync_cap_v1', '0'.repeat(32))
    expect(getWatchlistCapability()).toBe('')
  })

  it('rejects malformed capabilities rather than building a URL from them', () => {
    expect(validWatchlistCapability('nope')).toBe(false)
    expect(validWatchlistCapability('0'.repeat(32))).toBe(true)
    expect(watchlistSyncEndpoint('nope')).toBe('')
  })

  it('keeps the capability in an authorization header, never the URL', () => {
    const token = '0'.repeat(32)
    const device = '1'.repeat(32)
    expect(watchlistSyncEndpoint(token, 'https://worker.test/')).toBe('https://worker.test/watchlists')
    expect(watchlistSyncHeaders(token, device)).toEqual({
      Authorization: `Bearer ${token}`,
      'X-TTW-Device-ID': device,
    })
    expect(watchlistSyncEndpoint(token, 'https://worker.test/')).not.toContain(token)
    expect(watchlistSyncHeaders('bad')).toEqual({})
  })
})
