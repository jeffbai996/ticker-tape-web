import { describe, expect, it } from 'vitest'
import {
  atmContract, expectedMovePct, expiryForEvent, mid, moveEdge, typicalMovePct,
} from '../src/lib/expmove.js'

const c = (strike, bid, ask, last = null) => ({ strike, bid, ask, last })

describe('mid', () => {
  it('averages a two-sided market', () => {
    expect(mid(c(100, 4, 6))).toBe(5)
  })

  it('falls back to last when a side is missing', () => {
    expect(mid({ strike: 100, bid: null, ask: null, last: 4.2 })).toBe(4.2)
    expect(mid({ strike: 100, bid: 0, ask: 0, last: 3 })).toBe(3)
  })

  it('is null when there is no market at all', () => {
    expect(mid({ strike: 100, bid: 0, ask: 0, last: 0 })).toBe(null)
    expect(mid(null)).toBe(null)
  })
})

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

describe('expectedMovePct', () => {
  it('prices the ATM straddle as a percent of spot', () => {
    // 5.00 call + 5.00 put on a 100 spot = a 10% expected move
    const out = expectedMovePct({
      spot: 100,
      calls: [c(100, 4, 6), c(110, 1, 2)],
      puts: [c(100, 4, 6), c(90, 1, 2)],
    })
    expect(out).toBeCloseTo(10, 6)
  })

  it('refuses to price a one-sided chain', () => {
    expect(expectedMovePct({ spot: 100, calls: [c(100, 4, 6)], puts: [] })).toBe(null)
    expect(expectedMovePct({ spot: null, calls: [c(100, 4, 6)], puts: [c(100, 4, 6)] })).toBe(null)
  })

  it('refuses when a side has no market and no last', () => {
    const out = expectedMovePct({
      spot: 100,
      calls: [{ strike: 100, bid: 0, ask: 0, last: 0 }],
      puts: [c(100, 4, 6)],
    })
    expect(out).toBe(null)
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
