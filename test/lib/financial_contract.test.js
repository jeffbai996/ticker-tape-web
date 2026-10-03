import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/contracts/financial-positions-v1.json'
import { positionRows } from '../../src/lib/demo.js'
import { brokerBook } from '../../src/lib/brokerBook.js'

describe('canonical broker gross-base contract', () => {
  for (const account of fixture.accounts) {
    it(`preserves account attribution and gross weights for ${account.account}`, () => {
      const book = brokerBook({
        account: account.account, currency: account.base_currency,
        currency_unavailable: account.base_currency === null,
        positions: account.positions.map((p) => ({
          ...p, account: account.account, avg_cost: 90, unrealized_pnl: 100,
          base_currency: account.base_currency,
          market_value_base: p.expected_market_value_base,
          weight_pct: p.expected_weight_pct,
        })),
      })
      const positions = book.positions
      const quotes = Object.fromEntries(positions.map((p) => [p.symbol, { price: 100, pct: -10 }]))
      const rows = positionRows(positions, quotes)
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i], expected = account.positions[i]
        const fx = Number(account.fx_to_base[row.currency] || 1)
        expect(row.account).toBe(account.account)
        expect(row.mktValue).toBe(expected.expected_market_value_base)
        if (account.base_currency === null) {
          expect(book.currency).toBeNull()
          expect(row.baseAvailable).toBe(false)
          expect(row.weight).toBeNull()
          expect(row.costBasis).toBeNull()
          expect(row.unrealPnl).toBeNull()
          expect(row.dayPnl).toBeNull()
          expect(row.nativeValue).toBe(expected.market_value)
          expect(row.nativeUnreal).toBe(100)
          expect(row.currency).toBe(expected.currency)
          continue
        }
        expect(row.weight).toBeCloseTo(expected.expected_weight_pct, 2)
        expect(row.unrealPnl).toBeCloseTo(100 * fx, 8)
        if (row.shares < 0) expect(row.dayPnl).toBeGreaterThan(0)
      }
    })
  }
})
