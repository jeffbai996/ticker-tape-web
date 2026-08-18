import { describe, expect, it } from 'vitest'
import { atmContract, expiryForEvent, moveEdge, typicalMovePct } from '../../src/lib/expmove.js'
import { expectedMove } from '../../src/lib/optionsIntel.js'

const c = (strike, bid, ask, last = null) => ({ strike, bid, ask, last })

// Exactly what EarningsDay does with the chain it fetched, so these assertions
// are the earnings card's contract and not a paraphrase of it.
const impliedPct = (chain) => expectedMove(chain)?.pct ?? null

describe('atmContract', () => {
  it('picks the strike nearest spot, from either side', () => {
    const chain = [c(90, 1, 2), c(100, 1, 2), c(110, 1, 2)]
    expect(atmContract(chain, 104).strike).toBe(100)
    expect(atmContract(chain, 106).strike).toBe(110)
  })

  it('is null without a chain or a spot', () => {
    expect(atmContract([], 100)).toBe(null)
    expect(atmContract([c(100, 1, 2)], null)).toBe(null)
  })
})

// The number the earnings card prints. A straddle is ONE strike bought twice:
// choosing the nearest call and the nearest put independently lands on two
// different strikes as soon as a chain's sides are not symmetric, and summing
// those two premiums prices a strangle while calling it a straddle.
describe('earnings-day implied move', () => {
  // Thin name, real shape: the puts are simply not quoted at the strike
  // nearest spot, so the two sides' ladders do not line up.
  const asymmetric = {
    spot: 102,
    calls: [c(95, 8.4, 8.8), c(100, 4.8, 5.2), c(105, 2.4, 2.6), c(110, 0.9, 1.1)],
    puts: [c(95, 1.4, 1.6), c(105, 5.4, 5.6), c(110, 8.4, 8.6)],
  }

  it('prices the ATM straddle as a percent of spot', () => {
    // 5.00 call + 5.00 put on a 100 spot = a 10% expected move
    expect(impliedPct({
      spot: 100,
      calls: [c(100, 4, 6), c(110, 1, 2)],
      puts: [c(100, 4, 6), c(90, 1, 2)],
    })).toBeCloseTo(10, 6)
  })

  it('prices one strike quoted on both sides, never a call and a put from different ones', () => {
    // 105 is the nearest strike with a market on BOTH sides: 2.50 + 5.50 = 8.00
    // on a 102 spot. Pairing the 100 call (5.00) with the 105 put (5.50) is a
    // strangle, and it prints 10.29% instead.
    const out = impliedPct(asymmetric)
    expect(out).toBeCloseTo((8 / 102) * 100, 6)
    expect(out).not.toBeCloseTo((10.5 / 102) * 100, 6)
  })

  it('is unchanged on a chain whose sides already line up', () => {
    const symmetric = {
      spot: 100,
      calls: [c(95, 6, 6.4), c(100, 3, 3.2), c(105, 1, 1.2)],
      puts: [c(95, 1, 1.2), c(100, 2.6, 2.8), c(105, 5.8, 6.2)],
    }
    const implied = impliedPct(symmetric)
    expect(implied).toBeCloseTo(((3.1 + 2.7) / 100) * 100, 6)

    // and the card's labelling off that number stays put
    const typical = typicalMovePct([{ priceMove: 6 }, { priceMove: -4 }, { priceMove: 5 }, { priceMove: -3 }])
    expect(typical).toBeCloseTo(4.5, 6)
    const edge = moveEdge(implied, typical)
    expect(edge.ratio).toBeCloseTo(5.8 / 4.5, 6)
    expect(edge.verdict).toBe('rich')
  })

  it('refuses a chain with no strike quoted on both sides', () => {
    expect(impliedPct({ spot: 100, calls: [c(100, 4, 6)], puts: [c(105, 4, 6)] })).toBe(null)
  })

  it('refuses a one-sided chain, or one with no spot to measure against', () => {
    expect(impliedPct({ spot: 100, calls: [c(100, 4, 6)], puts: [] })).toBe(null)
    expect(impliedPct({ spot: null, calls: [c(100, 4, 6)], puts: [c(100, 4, 6)] })).toBe(null)
    expect(impliedPct({ spot: 0, calls: [c(100, 4, 6)], puts: [c(100, 4, 6)] })).toBe(null)
  })

  it('refuses when a side has no market and no last', () => {
    expect(impliedPct({
      spot: 100,
      calls: [{ strike: 100, bid: 0, ask: 0, last: 0 }],
      puts: [c(100, 4, 6)],
    })).toBe(null)
  })
})

describe('expiryForEvent', () => {
  const day = 86400
  const now = 1_700_000_000

  it('takes the first expiry on or after the print', () => {
    const exps = [now - day, now + 2 * day, now + 9 * day]
    expect(expiryForEvent(exps, (now + day) * 1000)).toBe(now + 2 * day)
  })

  it('counts an expiry landing exactly on the print', () => {
    expect(expiryForEvent([now, now + day], now * 1000)).toBe(now)
  })

  it('is null when every expiry precedes the print', () => {
    expect(expiryForEvent([now - day], (now + day) * 1000)).toBe(null)
    expect(expiryForEvent([], Date.now())).toBe(null)
  })
})

describe('typicalMovePct', () => {
  it('averages the magnitude of past reactions, direction ignored', () => {
    expect(typicalMovePct([{ priceMove: 6 }, { priceMove: -4 }])).toBe(5)
  })

  it('skips quarters with no measured reaction', () => {
    expect(typicalMovePct([{ priceMove: 8 }, { priceMove: null }])).toBe(8)
    expect(typicalMovePct([{ priceMove: null }])).toBe(null)
    expect(typicalMovePct([])).toBe(null)
  })
})

describe('moveEdge', () => {
  it('calls it rich when implied runs well past realized', () => {
    expect(moveEdge(10, 5)).toEqual({ ratio: 2, verdict: 'rich' })
  })

  it('calls it cheap when implied sits under realized', () => {
    expect(moveEdge(4, 8).verdict).toBe('cheap')
  })

  it('calls the middle band fair', () => {
    expect(moveEdge(5.2, 5).verdict).toBe('fair')
    expect(moveEdge(4.5, 5).verdict).toBe('fair')
  })

  it('is null without both numbers', () => {
    expect(moveEdge(null, 5)).toBe(null)
    expect(moveEdge(5, null)).toBe(null)
    expect(moveEdge(5, 0)).toBe(null)
  })
})
