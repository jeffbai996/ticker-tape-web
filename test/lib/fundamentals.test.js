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
