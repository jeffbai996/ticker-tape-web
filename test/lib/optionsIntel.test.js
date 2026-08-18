import { describe, expect, it } from 'vitest'
import { bsDelta } from '../../src/lib/bs.js'
import {
  atmIv, chainTotals, diffSession, expectedMove, ivTermStructure,
  skew25Delta, volumeOiOutliers, yearsTo,
} from '../../src/lib/optionsIntel.js'

// Synthetic chains only — generic strikes around a round spot, never a real
// symbol's actual quoted numbers.
function contract(strike, { iv = null, volume = null, oi = null, bid = null, ask = null, last = null } = {}) {
  return { strike, iv, volume, oi, bid, ask, last }
}

describe('yearsTo', () => {
  it('floors at 1/365 so same-day expiries still price', () => {
    expect(yearsTo(Math.floor(Date.now() / 1000))).toBeCloseTo(1 / 365, 5)
  })
  it('returns null with no expiration', () => {
    expect(yearsTo(null)).toBeNull()
  })
})

describe('expectedMove', () => {
  it('prices the ATM straddle as a percent of spot', () => {
    const chain = {
      spot: 100,
      calls: [contract(95, { bid: 6, ask: 6.4 }), contract(100, { bid: 3, ask: 3.2 }), contract(105, { bid: 1, ask: 1.2 })],
      puts: [contract(95, { bid: 1, ask: 1.2 }), contract(100, { bid: 2.6, ask: 2.8 }), contract(105, { bid: 5.8, ask: 6.2 })],
    }
    const em = expectedMove(chain)
    expect(em.strike).toBe(100)
    expect(em.price).toBeCloseTo(3.1 + 2.7, 5)
    expect(em.pct).toBeCloseTo(((3.1 + 2.7) / 100) * 100, 5)
  })

  it('is null without a spot or a priceable ATM pair', () => {
    expect(expectedMove({ spot: null, calls: [], puts: [] })).toBeNull()
    expect(expectedMove({ spot: 100, calls: [], puts: [] })).toBeNull()
  })

  // A straddle is ONE strike bought twice. Picking the nearest call and the
  // nearest put independently can land on two different strikes on a chain
  // whose sides are not symmetric, and summing those two premiums prices a
  // strangle while calling it a straddle.
  it('prices one shared strike, never a call and a put from different ones', () => {
    const chain = {
      spot: 100,
      calls: [contract(100, { bid: 3, ask: 3.2 }), contract(110, { bid: 0.8, ask: 1 })],
      puts: [contract(90, { bid: 0.9, ask: 1.1 }), contract(110, { bid: 10.8, ask: 11.2 })],
    }
    const em = expectedMove(chain)
    expect(em.strike).toBe(110)
    expect(em.price).toBeCloseTo(0.9 + 11, 5)
  })

  it('is null when no strike is quoted on both sides', () => {
    expect(expectedMove({
      spot: 100,
      calls: [contract(100, { bid: 3, ask: 3.2 })],
      puts: [contract(105, { bid: 5, ask: 5.2 })],
    })).toBeNull()
  })

  // A side quoted 0 x 2 is a real one-sided market; mid is 1, not "no market".
  it('takes a one-sided book at its mid rather than dropping the strike', () => {
    const em = expectedMove({
      spot: 100,
      calls: [contract(100, { bid: 0, ask: 2 })],
      puts: [contract(100, { bid: 1.8, ask: 2.2 })],
    })
    expect(em.price).toBeCloseTo(1 + 2, 5)
  })
})

describe('atmIv', () => {
  it('averages the nearest call and put IV at the ATM strike', () => {
    const chain = {
      spot: 100,
      calls: [contract(100, { iv: 0.30 })],
      puts: [contract(100, { iv: 0.34 })],
    }
    expect(atmIv(chain)).toBeCloseTo(0.32, 5)
  })

  it('ignores zero/missing IV on one side rather than treating it as zero vol', () => {
    const chain = { spot: 100, calls: [contract(100, { iv: 0.30 })], puts: [contract(100, { iv: null })] }
    expect(atmIv(chain)).toBeCloseTo(0.30, 5)
  })
})

describe('ivTermStructure', () => {
  const chain = (expiration, iv) => ({
    expiration,
    calls: [contract(100, { iv })],
    puts: [contract(100, { iv })],
    spot: 100,
  })
  const now = Date.now()
  const days = (n) => Math.round(now / 1000) + n * 86_400

  it('labels contango when the back month prices richer than the front', () => {
    const out = ivTermStructure([chain(days(30), 0.25), chain(days(180), 0.35)], now)
    expect(out.points.map((p) => p.dte)).toEqual([30, 180])
    expect(out.shape).toBe('contango')
  })

  it('labels backwardation when the near date is the stressed one', () => {
    const out = ivTermStructure([chain(days(180), 0.20), chain(days(7), 0.55)], now)
    expect(out.front.dte).toBe(7)
    expect(out.shape).toBe('backwardation')
  })

  it('needs at least two priced points to have a shape', () => {
    expect(ivTermStructure([chain(days(30), 0.25)], now).shape).toBeNull()
    expect(ivTermStructure([], now).shape).toBeNull()
  })
})

describe('skew25Delta', () => {
  it('picks the contract nearest a 0.25 delta on each side and reports the IV gap', () => {
    const spot = 100
    const t = 0.5
    const strikes = [80, 85, 90, 95, 100, 105, 110, 115, 120]
    const callIv = (k) => 0.25 + (k - 100) * 0.001   // mild upward skew by strike
    const putIv = (k) => 0.30 - (k - 100) * 0.001
    const calls = strikes.map((k) => contract(k, { iv: callIv(k) }))
    const puts = strikes.map((k) => contract(k, { iv: putIv(k) }))
    const chain = { spot, expiration: Math.floor(Date.now() / 1000) + t * 365 * 86400, calls, puts }

    // ground truth: same nearest-to-target-delta search, computed independently
    const nearest = (contracts, type) => contracts.reduce((best, c) => {
      const d = Math.abs(bsDelta({ spot, strike: c.strike, t, iv: c.iv, type }))
      const bd = best ? Math.abs(bsDelta({ spot, strike: best.strike, t, iv: best.iv, type })) : null
      return best == null || Math.abs(d - 0.25) < Math.abs(bd - 0.25) ? c : best
    }, null)
    const wantCall = nearest(calls, 'call')
    const wantPut = nearest(puts, 'put')

    const out = skew25Delta(chain, { t })
    expect(out.method).toBe('delta')
    expect(out.callStrike).toBe(wantCall.strike)
    expect(out.putStrike).toBe(wantPut.strike)
    expect(out.skew).toBeCloseTo(wantPut.iv - wantCall.iv, 10)
  })

  it('falls back to a strike-band proxy when no contract has a priceable IV', () => {
    const chain = {
      spot: 100,
      expiration: Math.floor(Date.now() / 1000) + 30 * 86400,
      calls: [contract(95), contract(100), contract(105, { iv: null })],
      puts: [contract(95), contract(100), contract(105)],
    }
    // no IVs at all — every contract must fall back, so the function should
    // return null rather than pretend to have a number when nothing is
    // priceable on the fallback strikes either
    expect(skew25Delta(chain)).toBeNull()
  })

  it('is null without a spot or an empty chain', () => {
    expect(skew25Delta({ spot: null, calls: [], puts: [] })).toBeNull()
    expect(skew25Delta({ spot: 100, calls: [], puts: [] })).toBeNull()
  })
})

describe('volumeOiOutliers', () => {
  it('flags contracts at or above the documented ratio and volume floor', () => {
    const chain = {
      calls: [
        contract(100, { volume: 1500, oi: 400 }),   // ratio 3.75, vol 1500 — flagged
        contract(105, { volume: 400, oi: 50 }),      // ratio 8 but under the 500 volume floor — not flagged
        contract(110, { volume: 600, oi: 300 }),     // ratio 2 — under the 3x floor — not flagged
      ],
      puts: [
        contract(95, { volume: 900, oi: 0 }),        // no OI at all, over the volume floor — flagged (new interest)
      ],
    }
    const out = volumeOiOutliers(chain)
    expect(out.map((o) => `${o.side}:${o.strike}`)).toEqual(['put:95', 'call:100'])
    expect(out.find((o) => o.strike === 100).ratio).toBeCloseTo(3.75, 5)
  })

  it('honors a custom baseline', () => {
    const chain = { calls: [contract(100, { volume: 200, oi: 50 })], puts: [] }
    expect(volumeOiOutliers(chain)).toEqual([])
    expect(volumeOiOutliers(chain, { minRatio: 3, minVolume: 100 })).toHaveLength(1)
  })
})

describe('chainTotals', () => {
  it('sums volume and open interest across both sides', () => {
    const chain = {
      calls: [contract(100, { volume: 100, oi: 10 }), contract(105, { volume: 50, oi: 5 })],
      puts: [contract(95, { volume: 30, oi: 3 })],
    }
    expect(chainTotals(chain)).toEqual({ volume: 180, oi: 18 })
  })
})

describe('diffSession', () => {
  it('is null with nothing to diff against', () => {
    expect(diffSession({ spot: 100, calls: [], puts: [] }, null)).toBeNull()
  })

  it('reports the move, IV, volume, and OI deltas vs the cached snapshot', () => {
    const mk = (iv, vol) => ({
      spot: 100,
      expiration: Math.floor(Date.now() / 1000) + 30 * 86400,
      calls: [contract(100, { iv, bid: 3, ask: 3.2, volume: vol, oi: 100 })],
      puts: [contract(100, { iv, bid: 2.8, ask: 3.0, volume: vol, oi: 100 })],
    })
    const prev = mk(0.30, 200)
    const curr = mk(0.35, 500)
    const out = diffSession(curr, prev)
    expect(out.ivDelta).toBeCloseTo(0.05, 5)
    expect(out.volumeDelta).toBe(600)
    expect(out.oiDelta).toBe(0)
  })
})
