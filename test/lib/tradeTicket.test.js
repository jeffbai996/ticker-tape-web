/** The trade ticket promises Gordon two numbers before he commits: what the
 *  trade costs, and what his position becomes. Wrong numbers here are worse
 *  than none.
 */
import { describe, expect, it } from 'vitest'
import { offLot, positionAfter, tradeEstimate } from '../../src/lib/tradeTicket.js'

describe('tradeEstimate', () => {
  it('is null until quantity and price are both real', () => {
    expect(tradeEstimate({ side: 'buy', qty: '', px: 38.9 })).toBeNull()
    expect(tradeEstimate({ side: 'buy', qty: 100, px: '' })).toBeNull()
    expect(tradeEstimate({ side: 'buy', qty: -5, px: 10 })).toBeNull()
  })
  it('adds the fee on a buy, subtracts it on a sell', () => {
    expect(tradeEstimate({ side: 'buy', qty: 100, px: 38.9, fee: 5 })).toBe(3895)
    expect(tradeEstimate({ side: 'sell', qty: 100, px: 38.9, fee: 5 })).toBe(3885)
    expect(tradeEstimate({ side: 'buy', qty: 100, px: 38.9 })).toBe(3890)
  })
})

describe('positionAfter', () => {
  const holdings = [{ symbol: '2628.HK', shares: 1000, cost: 25 }, { symbol: '0700.HK', shares: 100 }]
  it('adds on a buy, subtracts on a sell, never below zero', () => {
    expect(positionAfter(holdings, '2628.HK', { side: 'buy', qty: 200, px: 28 })).toMatchObject({ before: 1000, after: 1200 })
    expect(positionAfter(holdings, '2628.HK', { side: 'sell', qty: 200 })).toMatchObject({ before: 1000, after: 800, avgAfter: null })
    expect(positionAfter(holdings, '2628.HK', { side: 'sell', qty: 5000 }).after).toBe(0)
    expect(positionAfter(holdings, '2628.HK', { side: 'buy', qty: '' })).toBeNull()
  })
  it('averages cost on a buy only when it is honestly computable', () => {
    expect(positionAfter(holdings, '2628.HK', { side: 'buy', qty: 1000, px: 29, fee: 0 }).avgAfter).toBe(27)
    // held with no recorded cost → no fake average
    expect(positionAfter(holdings, '0700.HK', { side: 'buy', qty: 100, px: 450 }).avgAfter).toBeNull()
    // fresh row → the ticket IS the cost
    expect(positionAfter(holdings, '9988.HK', { side: 'buy', qty: 100, px: 120, fee: 10 }).avgAfter).toBe(120.1)
  })
})

describe('offLot', () => {
  it('warns only for off-lot mainland quantities', () => {
    expect(offLot('600036.SS', 150)).toBe(true)
    expect(offLot('600036.SS', 200)).toBe(false)
    expect(offLot('2628.HK', 150)).toBe(false)
    expect(offLot('600036.SS', '')).toBe(false)
  })
})
