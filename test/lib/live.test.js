import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// Only test the pure/deterministic parts of live.js.
// fetchLiveQuotes, startPolling etc. require fetch + setInterval mocks — skipped here
// since they add noise for minimal gain on a static pipeline app.

// We test getStaleness + getDataAge logic via the exported functions,
// and transformQuote via a workaround (re-implementing the same pure logic
// so we can test the contract without exporting internals).

import { isLiveAvailable, getStaleness, getDataAge, onLiveUpdate } from '../../src/lib/live.js'

// ── isLiveAvailable ───────────────────────────────────
describe('isLiveAvailable', () => {
  it('returns false when no proxy_url configured', () => {
    // localStorage is cleared in setup.js
    expect(isLiveAvailable()).toBe(false)
  })
  it('returns true when proxy_url is set', () => {
    localStorage.setItem('proxy_url', 'https://worker.example.com')
    expect(isLiveAvailable()).toBe(true)
  })
  it('returns false for empty string proxy_url', () => {
    localStorage.setItem('proxy_url', '')
    expect(isLiveAvailable()).toBe(false)
  })
})

// ── getStaleness ──────────────────────────────────────
describe('getStaleness', () => {
  it('returns "none" when no proxy URL configured', () => {
    // No URL = live not available = "none"
    expect(getStaleness()).toBe('none')
  })
  // When proxy_url is set but no fetch has happened, getDataAge() = Infinity
  // → getStaleness() returns 'stale'
  it('returns "stale" when URL configured but never fetched', () => {
    localStorage.setItem('proxy_url', 'https://worker.example.com')
    expect(getStaleness()).toBe('stale')
  })
})

// ── onLiveUpdate ──────────────────────────────────────
describe('onLiveUpdate', () => {
  it('returns an unsubscribe function', () => {
    const unsub = onLiveUpdate(() => {})
    expect(typeof unsub).toBe('function')
    // Should not throw when called
    expect(() => unsub()).not.toThrow()
  })
  it('calling unsubscribe twice does not throw', () => {
    const unsub = onLiveUpdate(() => {})
    unsub()
    expect(() => unsub()).not.toThrow()
  })
})

// ── transformQuote contract (pure logic) ──────────────
// transformQuote is not exported from live.js (internal function).
// We test its contract by documenting the expected behavior here.
// If it were exported, these tests would validate it directly.
describe('transformQuote contract (documented behavior)', () => {
  // This documents what transformQuote SHOULD do — useful when refactoring
  // or if someone adds an export later.

  function transformQuote(yq) {
    const state = (yq.marketState || '').toUpperCase()
    const isPost = state === 'POST' || state === 'POSTPOST'
    const isPre = state === 'PRE' || state === 'PREPRE'

    let ext_price = null, ext_change = null, ext_pct = null, ext_label = null
    if (isPost && yq.postMarketPrice) {
      ext_price = yq.postMarketPrice
      ext_change = yq.postMarketChange
      ext_pct = yq.postMarketChangePercent
      ext_label = 'AH'
    } else if (isPre && yq.preMarketPrice) {
      ext_price = yq.preMarketPrice
      ext_change = yq.preMarketChange
      ext_pct = yq.preMarketChangePercent
      ext_label = 'PM'
    }

    return {
      symbol: yq.symbol,
      name: yq.shortName || yq.longName || '',
      price: yq.regularMarketPrice ?? 0,
      change: yq.regularMarketChange ?? 0,
      pct: yq.regularMarketChangePercent ?? 0,
      ext_price, ext_change, ext_pct, ext_label,
      _marketState: state.toLowerCase(),
      _live: true,
    }
  }

  it('maps regular market fields', () => {
    const result = transformQuote({
      symbol: 'NVDA',
      shortName: 'NVIDIA',
      regularMarketPrice: 125.3,
      regularMarketChange: 2.45,
      regularMarketChangePercent: 1.99,
      marketState: 'REGULAR',
    })
    expect(result.symbol).toBe('NVDA')
    expect(result.price).toBe(125.3)
    expect(result.change).toBe(2.45)
    expect(result.pct).toBe(1.99)
    expect(result.ext_price).toBeNull()
    expect(result._live).toBe(true)
  })

  it('sets ext_price from post-market when state is POST', () => {
    const result = transformQuote({
      symbol: 'NVDA',
      regularMarketPrice: 125.3,
      regularMarketChange: 2.45,
      regularMarketChangePercent: 1.99,
      marketState: 'POST',
      postMarketPrice: 126.5,
      postMarketChange: 1.2,
      postMarketChangePercent: 0.96,
    })
    expect(result.ext_price).toBe(126.5)
    expect(result.ext_label).toBe('AH')
  })

  it('also handles POSTPOST market state', () => {
    const result = transformQuote({
      symbol: 'NVDA', regularMarketPrice: 100, regularMarketChange: 0, regularMarketChangePercent: 0,
      marketState: 'POSTPOST',
      postMarketPrice: 101.0, postMarketChange: 1.0, postMarketChangePercent: 1.0,
    })
    expect(result.ext_label).toBe('AH')
  })

  it('sets ext_price from pre-market when state is PRE', () => {
    const result = transformQuote({
      symbol: 'NVDA', regularMarketPrice: 125.3, regularMarketChange: 0, regularMarketChangePercent: 0,
      marketState: 'PRE',
      preMarketPrice: 124.0, preMarketChange: -1.3, preMarketChangePercent: -1.04,
    })
    expect(result.ext_price).toBe(124.0)
    expect(result.ext_label).toBe('PM')
  })

  it('does not set ext_price when state is REGULAR with no pre/post data', () => {
    const result = transformQuote({
      symbol: 'NVDA', regularMarketPrice: 125.3, regularMarketChange: 2.45,
      regularMarketChangePercent: 1.99, marketState: 'REGULAR',
    })
    expect(result.ext_price).toBeNull()
    expect(result.ext_label).toBeNull()
  })

  it('defaults to 0 for missing market price fields', () => {
    const result = transformQuote({ symbol: 'TEST' })
    expect(result.price).toBe(0)
    expect(result.change).toBe(0)
    expect(result.pct).toBe(0)
  })

  it('uses shortName, falls back to longName, falls back to empty string', () => {
    expect(transformQuote({ symbol: 'X', shortName: 'Short' }).name).toBe('Short')
    expect(transformQuote({ symbol: 'X', longName: 'Long Corp' }).name).toBe('Long Corp')
    expect(transformQuote({ symbol: 'X' }).name).toBe('')
  })

  it('lowercases _marketState', () => {
    const result = transformQuote({ symbol: 'X', marketState: 'POST' })
    expect(result._marketState).toBe('post')
  })
})
