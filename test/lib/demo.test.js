import { describe, it, expect } from 'vitest'
import {
  DEMO_POSITIONS, DEMO_CASH, positionRows, accountSummary,
  sizeForWeight, carryAt, stressGrid, nlvWalk,
} from '../../src/lib/demo.js'

// Fixed price map so every money number is hand-checkable.
const PRICES = {
  AAA: { price: 100, pct: 2.0, change: 1.96 },
  BBB: { price: 50, pct: -1.0, change: -0.51 },
}
const POS = [
  { symbol: 'AAA', shares: 10, avgCost: 80 },
  { symbol: 'BBB', shares: 20, avgCost: 60 },
]

describe('demo book invariants', () => {
  it('uses only generic sanctioned symbols', () => {
    const allowed = new Set(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD',
      'INTC', 'TSM', 'CRM', 'ORCL', 'NFLX', 'JPM', 'V', 'LLY', 'XOM', 'WMT', 'SPY', 'QQQ',
      'IWM', 'GLD', 'TLT'])
    for (const p of DEMO_POSITIONS) expect(allowed.has(p.symbol)).toBe(true)
  })

  it('keeps cash a small positive ballast (unlevered book)', () => {
    expect(DEMO_CASH).toBeGreaterThan(0)
    expect(DEMO_CASH).toBeLessThan(10_000)
  })
})

describe('positionRows', () => {
  it('computes value, weight, day and unrealized P&L', () => {
    const rows = positionRows(POS, PRICES)
    const a = rows.find((r) => r.symbol === 'AAA')
    expect(a.mktValue).toBeCloseTo(1000)
    expect(a.unrealPnl).toBeCloseTo(200)           // (100-80)*10
    expect(a.unrealPct).toBeCloseTo(25)            // 200 / 800
    expect(a.dayPnl).toBeCloseTo(19.6)             // 1.96 * 10
    // weights over gross 1000 + 1000
    expect(a.weight).toBeCloseTo(50)
  })

  it('leaves price-dependent fields null when a quote is missing', () => {
    const rows = positionRows(POS, { AAA: PRICES.AAA })
    const b = rows.find((r) => r.symbol === 'BBB')
    expect(b.mktValue).toBeNull()
    expect(b.unrealPnl).toBeNull()
    const a = rows.find((r) => r.symbol === 'AAA')
    expect(a.mktValue).toBeCloseTo(1000)
  })
})

describe('accountSummary', () => {
  it('derives NLV, leverage, and margin stats from the book', () => {
    const s = accountSummary(POS, PRICES, 500)
    expect(s.gross).toBeCloseTo(2000)
    expect(s.nlv).toBeCloseTo(2500)
    expect(s.cash).toBe(500)
    expect(s.leverage).toBeCloseTo(0.8)
    expect(s.maintenance).toBeCloseTo(500)         // 25% of gross
    expect(s.excessLiq).toBeCloseTo(2000)          // nlv - maintenance
    expect(s.cushionPct).toBeCloseTo(80)           // excess / nlv
    expect(s.dayPnl).toBeCloseTo(19.6 - 10.2)      // sum of position day P&L
  })

  it('returns nulls when any position lacks a price', () => {
    const s = accountSummary(POS, { AAA: PRICES.AAA }, 500)
    expect(s.nlv).toBeNull()
    expect(s.leverage).toBeNull()
  })
})

describe('sizeForWeight', () => {
  it('sizes a new position to the target weight', () => {
    const r = sizeForWeight({ nlv: 50_000, price: 100, targetPct: 10, currentShares: 0 })
    expect(r.targetShares).toBe(50)
    expect(r.delta).toBe(50)
    expect(r.cost).toBeCloseTo(5000)
  })

  it('computes the delta against an existing position', () => {
    const r = sizeForWeight({ nlv: 50_000, price: 100, targetPct: 10, currentShares: 80 })
    expect(r.targetShares).toBe(50)
    expect(r.delta).toBe(-30)                      // trim
  })

  it('returns null on degenerate input', () => {
    expect(sizeForWeight({ nlv: 0, price: 100, targetPct: 10, currentShares: 0 })).toBeNull()
    expect(sizeForWeight({ nlv: 50_000, price: 0, targetPct: 10, currentShares: 0 })).toBeNull()
  })
})

describe('carryAt', () => {
  it('is free when the book is unlevered', () => {
    const c = carryAt({ nlv: 50_000, targetLeverage: 0.9, ratePct: 5.5 })
    expect(c.borrow).toBe(0)
    expect(c.perDay).toBe(0)
  })

  it('prices the margin loan at the target leverage', () => {
    const c = carryAt({ nlv: 50_000, targetLeverage: 1.5, ratePct: 5.5 })
    expect(c.borrow).toBeCloseTo(25_000)           // (1.5-1) * nlv
    expect(c.perYear).toBeCloseTo(1375)
    expect(c.perDay).toBeCloseTo(1375 / 365)
  })
})

describe('stressGrid', () => {
  it('beta-weights the shock per position', () => {
    const betas = { AAA: 2.0, BBB: 0.5 }
    const [down] = stressGrid(POS, PRICES, betas, [-10])
    // AAA: 1000 * -10% * 2.0 = -200; BBB: 1000 * -10% * 0.5 = -50
    expect(down.move).toBe(-10)
    expect(down.pnl).toBeCloseTo(-250)
  })

  it('defaults missing betas to 1', () => {
    const [row] = stressGrid(POS, PRICES, {}, [10])
    expect(row.pnl).toBeCloseTo(200)
  })
})

describe('nlvWalk', () => {
  it('is deterministic for the same seed and ends at the target NLV', () => {
    const a = nlvWalk('demo', 252, 50_000)
    const b = nlvWalk('demo', 252, 50_000)
    expect(a).toEqual(b)
    expect(a).toHaveLength(252)
    expect(a[a.length - 1].value).toBeCloseTo(50_000)
    expect(a.every((p) => p.value > 0)).toBe(true)
    // times ascend (unix seconds, daily)
    expect(a[1].time).toBeGreaterThan(a[0].time)
  })

  it('changes with the seed', () => {
    expect(nlvWalk('x', 50, 50_000)).not.toEqual(nlvWalk('y', 50, 50_000))
  })
})
