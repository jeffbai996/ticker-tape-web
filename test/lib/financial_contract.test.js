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


describe('broker adapter nullable financial legs', () => {
  const position = { symbol: 'FIXTURE', account: 'synthetic', currency: 'USD',
    base_currency: 'CAD', shares: 2, avg_cost: 80, market_price: 100,
    market_value: 200, market_value_base: 270, weight_pct: 100, unrealized_pnl: 40 }
  const adapt = (overrides) => brokerBook({ account: 'synthetic', currency: 'CAD',
    positions: [{ ...position, ...overrides }] })
  for (const value of [null, undefined, NaN, Infinity, '270']) {
    it(`withholds an unavailable or invalid base leg (${String(value)})`, () => {
      const book = adapt({ market_value_base: value, weight_pct: null })
      const [row] = positionRows(book.positions, {})
      expect(row.mktValue).toBeNull()
      expect(row.weight).toBeNull()
      expect(row.unrealPnl).toBeNull()
      expect(row.dayPnl).toBeNull()
      expect(row.nativeValue).toBe(200)
      expect(row.nativeUnreal).toBe(40)
      expect(row.account).toBe('synthetic')
      expect(row.currency).toBe('USD')
    })
  }
  it('keeps real zero amounts distinct from unavailable legs', () => {
    const book = adapt({ market_value: 0, market_value_base: 0, unrealized_pnl: 0,
      currency: 'CAD', weight_pct: 0 })
    const [row] = positionRows(book.positions, {})
    expect(row.mktValue).toBe(0)
    expect(row.nativeValue).toBe(0)
    expect(row.nativeUnreal).toBe(0)
    expect(row.unrealPnl).toBe(0)
  })
  it('keeps a received base leg while withholding unconvertible nullable native legs', () => {
    const [row] = positionRows(adapt({ market_value: null, market_price: null,
      unrealized_pnl: null }).positions, { FIXTURE: { price: 999, pct: 10 } })
    expect(row.mktValue).toBe(270)
    expect(row.nativeValue).toBeNull()
    expect(row.nativeUnreal).toBeNull()
    expect(row.price).toBeNull()
    expect(row.costBasis).toBeNull()
    expect(row.unrealPnl).toBeNull()
    expect(row.dayPnl).toBeNull()
  })
  it('derives a missing native amount only from the received broker mark and shares', () => {
    const [row] = positionRows(adapt({ market_value: null }).positions,
      { FIXTURE: { price: 999, pct: 10 } })
    expect(row.nativeValue).toBe(200)
    expect(row.unrealPnl).toBe(54)
    expect(row.price).toBe(100)
  })
})
