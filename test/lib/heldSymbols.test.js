import { beforeEach, describe, expect, it } from 'vitest'
import { heldSymbols, rememberBrokerHoldings } from '../../src/lib/heldSymbols.js'

describe('heldSymbols', () => {
  beforeEach(() => localStorage.clear())
  it('is the broker holdings last seen on the IBKR page, without duplicates', () => {
    rememberBrokerHoldings(['MU', 'NVDA', 'NVDA', ''])
    expect(heldSymbols({ portfolios: [] })).toEqual(['MU', 'NVDA'])
  })
  it('includes the hand-entered portfolios\' holdings', () => {
    rememberBrokerHoldings(['MU'])
    const portfolios = [{ id: 'a', holdings: [{ symbol: '0700.HK' }, { symbol: 'MU' }] }]
    expect(heldSymbols({ portfolios })).toEqual(['MU', '0700.HK'])
  })
  it('is empty when nothing has been seen', () => {
    expect(heldSymbols({ portfolios: [] })).toEqual([])
  })
})
