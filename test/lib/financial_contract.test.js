import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/contracts/financial-positions-v1.json'
import { positionRows } from '../../src/lib/demo.js'

describe('canonical broker gross-base contract', () => {
  for (const account of fixture.accounts) {
    it(`preserves account attribution and gross weights for ${account.account}`, () => {
      const positions = account.positions.map((p) => ({
        symbol: p.symbol, account: account.account, currency: p.currency,
        shares: p.shares, avgCost: 90, livePrice: p.market_price,
        liveValue: p.market_value, liveBase: p.expected_market_value_base,
        liveUnreal: 100,
      }))
      const quotes = Object.fromEntries(positions.map((p) => [p.symbol, { price: 100, pct: -10 }]))
      const rows = positionRows(positions, quotes)
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i], expected = account.positions[i]
        const fx = Number(account.fx_to_base[row.currency] || 1)
        expect(row.account).toBe(account.account)
        expect(row.mktValue).toBe(expected.expected_market_value_base)
        expect(row.weight).toBeCloseTo(expected.expected_weight_pct, 2)
        expect(row.unrealPnl).toBeCloseTo(100 * fx, 8)
        if (row.shares < 0) expect(row.dayPnl).toBeGreaterThan(0)
      }
    })
  }
})
