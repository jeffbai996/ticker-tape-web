import { describe, it, expect } from 'vitest'
import { flattenSummary } from '../../src/lib/fundamentals.js'
import { fmtBig, fmtRatio, fmtFracPct } from '../../src/lib/format.js'

describe('flattenSummary', () => {
  const fixture = {
    summaryDetail: {
      trailingPE: { raw: 31.2, fmt: '31.20' },
      dividendYield: { raw: 0.0045, fmt: '0.45%' },
      beta: { raw: 1.21, fmt: '1.21' },
      marketCap: { raw: 3_400_000_000_000, fmt: '3.4T' },
    },
    defaultKeyStatistics: {
      forwardPE: { raw: 27.8 },
      pegRatio: { raw: 2.1 },
      enterpriseToEbitda: { raw: 24.5 },
      shortPercentOfFloat: { raw: 0.012 },
      priceToBook: { raw: 45.1 },
    },
    financialData: {
      grossMargins: { raw: 0.46 },
      operatingMargins: { raw: 0.3 },
      profitMargins: { raw: 0.25 },
      returnOnEquity: { raw: 1.5 },
      debtToEquity: { raw: 176.3 },
      freeCashflow: { raw: 100_000_000_000 },
      targetMeanPrice: { raw: 250 },
      recommendationKey: 'buy',
    },
  }

  it('extracts raw numbers into a flat object', () => {
    const f = flattenSummary(fixture)
    expect(f.trailingPE).toBe(31.2)
    expect(f.forwardPE).toBe(27.8)
    expect(f.grossMargins).toBe(0.46)
    expect(f.marketCap).toBe(3_400_000_000_000)
    expect(f.recommendationKey).toBe('buy')
  })

  it('leaves missing fields undefined without throwing', () => {
    const f = flattenSummary({ summaryDetail: {} })
    expect(f.trailingPE).toBeUndefined()
    expect(f.grossMargins).toBeUndefined()
  })

  it('handles a completely empty result', () => {
    expect(() => flattenSummary(undefined)).not.toThrow()
  })
})

describe('fmtBig', () => {
  it('abbreviates trillions/billions/millions', () => {
    expect(fmtBig(3_400_000_000_000)).toBe('3.40T')
    expect(fmtBig(215_000_000_000)).toBe('215.00B')
    expect(fmtBig(45_600_000)).toBe('45.60M')
  })
  it('dashes missing values', () => {
    expect(fmtBig(null)).toBe('—')
  })
})

describe('fmtRatio', () => {
  it('fixes to two decimals', () => {
    expect(fmtRatio(31.234)).toBe('31.23')
  })
  it('dashes missing/NaN', () => {
    expect(fmtRatio(undefined)).toBe('—')
  })
})

describe('fmtFracPct', () => {
  it('renders a fraction as percent', () => {
    expect(fmtFracPct(0.4612)).toBe('46.12%')
  })
  it('dashes missing values', () => {
    expect(fmtFracPct(null)).toBe('—')
  })
})

describe('parseAnalysts', () => {
  it('extracts current trend, targets, and rating changes', async () => {
    const { parseAnalysts } = await import('../../src/lib/fundamentals.js')
    const out = parseAnalysts({
      recommendationTrend: { trend: [
        { period: '0m', strongBuy: 12, buy: 41, hold: 3, sell: 0, strongSell: 0 },
        { period: '-1m', strongBuy: 13, buy: 40, hold: 3, sell: 0, strongSell: 0 },
      ] },
      financialData: {
        targetLowPrice: { raw: 400 }, targetMeanPrice: { raw: 561.11 },
        targetHighPrice: { raw: 870 }, numberOfAnalystOpinions: { raw: 55 },
      },
      upgradeDowngradeHistory: { history: [
        { epochGradeDate: 1782400845, firm: 'Stifel', toGrade: 'Hold', fromGrade: 'Hold',
          action: 'main', currentPriceTarget: 400, priorPriceTarget: 415 },
      ] },
    })
    expect(out.trend.buy).toBe(41)
    expect(out.targets.mean).toBeCloseTo(561.11)
    expect(out.targets.analysts).toBe(55)
    expect(out.history[0].firm).toBe('Stifel')
    expect(out.history[0].date).toBe(1782400845000)
  })

  it('degrades to nulls on empty modules', async () => {
    const { parseAnalysts } = await import('../../src/lib/fundamentals.js')
    const out = parseAnalysts({})
    expect(out.trend).toBeNull()
    expect(out.targets.mean).toBeNull()
    expect(out.history).toEqual([])
  })
})
