import { describe, expect, it } from 'vitest'
import { applyOvernightFill } from '../../src/lib/overnightFill.js'

const NOW = 1_700_000_000
const row = (over = {}) => ({
  symbol: 'NVDA', price: 220.02, previous_close: 219.22,
  change_pct: 0.36, timestamp: NOW - 5, source: 'ibkr_overnight', ...over,
})
const quote = (over = {}) => ({
  symbol: 'NVDA', price: 219.22, pct: 3.43,
  extLabel: 'ON', extPrice: 219.9, extPct: 0.31, extMarketTime: NOW - 300, ...over,
})

describe('applyOvernightFill', () => {
  it('fills the ON quote when the stream has gone quiet', () => {
    const q = applyOvernightFill(quote(), row(), NOW)
    expect(q.extPrice).toBe(220.02)
    expect(q.extPct).toBe(0.36)
    expect(q.extLabel).toBe('ON')
    expect(q.extMarketTime).toBe(NOW - 5)
  })

  // the websocket is the faster pipe when it's actually ticking — a broker
  // snapshot must not shove aside a print from twenty seconds ago
  it('defers to a fresh stream tick', () => {
    const q = quote({ extMarketTime: NOW - 20 })
    expect(applyOvernightFill(q, row(), NOW)).toBe(q)
  })

  it('creates the ON quote when yahoo had nothing at all', () => {
    const bare = { symbol: 'NVDA', price: 219.22, pct: 3.43 }
    const q = applyOvernightFill(bare, row(), NOW)
    expect(q.extLabel).toBe('ON')
    expect(q.extPrice).toBe(220.02)
  })

  it('ignores non-overnight or stale or dud rows', () => {
    const q = quote()
    expect(applyOvernightFill(q, row({ source: 'yahoo' }), NOW)).toBe(q)
    expect(applyOvernightFill(q, row({ timestamp: NOW - 300 }), NOW)).toBe(q)
    expect(applyOvernightFill(q, row({ price: null }), NOW)).toBe(q)
    expect(applyOvernightFill(q, null, NOW)).toBe(q)
    expect(applyOvernightFill(null, row(), NOW)).toBe(null)
  })

  it('never touches the regular-session figures', () => {
    const q = applyOvernightFill(quote(), row(), NOW)
    expect(q.price).toBe(219.22)
    expect(q.pct).toBe(3.43)
  })
})
