/** Multi-currency portfolios (Jeff 2026-08-20): a book can hold USD, CAD,
 *  HKD and CNY names at once, and each portfolio picks its own display
 *  currency. All conversion goes through live Yahoo FX pairs quoted against
 *  USD — one hop to USD, one hop out — so four currencies need three pairs,
 *  not six.
 */
import { describe, expect, it } from 'vitest'
import {
  PORTFOLIO_CCYS, convertCcy, fxPairSymbol, fxSymbolsFor, holdingCurrency,
  ratesFromQuotes, fmtCcy,
} from '../../src/lib/fx.js'

describe('the supported set', () => {
  it('covers the household currencies', () => {
    expect(PORTFOLIO_CCYS).toEqual(['USD', 'CAD', 'HKD', 'CNY'])
  })
})

describe('fxPairSymbol / fxSymbolsFor — which quotes to follow', () => {
  it('quotes every non-USD currency against USD', () => {
    expect(fxPairSymbol('CAD')).toBe('CADUSD=X')
    expect(fxPairSymbol('HKD')).toBe('HKDUSD=X')
    expect(fxPairSymbol('USD')).toBeNull()
  })

  it('collects the unique pairs a mixed book needs', () => {
    expect(fxSymbolsFor(['USD', 'CAD', 'CAD', 'CNY'])).toEqual(['CADUSD=X', 'CNYUSD=X'])
    expect(fxSymbolsFor(['USD'])).toEqual([])
    expect(fxSymbolsFor([])).toEqual([])
  })
})

describe('ratesFromQuotes — live map to a rate table', () => {
  it('reads each pair price and pins USD at 1', () => {
    const live = {
      'CADUSD=X': { quote: { price: 0.73 } },
      'HKDUSD=X': { quote: { price: 0.1281 } },
    }
    expect(ratesFromQuotes(live)).toEqual({ USD: 1, CAD: 0.73, HKD: 0.1281 })
  })

  it('skips a pair that has not priced yet instead of inventing a rate', () => {
    const live = { 'CADUSD=X': { quote: { price: 0 } }, 'CNYUSD=X': {} }
    expect(ratesFromQuotes(live)).toEqual({ USD: 1 })
  })
})

describe('convertCcy — one hop through USD', () => {
  const rates = { USD: 1, CAD: 0.73, HKD: 0.128, CNY: 0.139 }

  it('is the identity within a currency', () => {
    expect(convertCcy(100, 'CAD', 'CAD', rates)).toBe(100)
  })

  it('crosses via USD in both directions', () => {
    expect(convertCcy(100, 'CAD', 'USD', rates)).toBeCloseTo(73)
    expect(convertCcy(73, 'USD', 'CAD', rates)).toBeCloseTo(100)
    expect(convertCcy(1000, 'HKD', 'CNY', rates)).toBeCloseTo((1000 * 0.128) / 0.139)
  })

  it('returns null rather than a wrong number when a rate is missing', () => {
    expect(convertCcy(100, 'GBP', 'USD', rates)).toBeNull()
    expect(convertCcy(100, 'USD', 'CNY', { USD: 1 })).toBeNull()
    expect(convertCcy(null, 'USD', 'CAD', rates)).toBeNull()
  })
})

describe('holdingCurrency — what a holding is denominated in', () => {
  it('trusts the quote first', () => {
    expect(holdingCurrency('WHATEVER', { currency: 'HKD' })).toBe('HKD')
    expect(holdingCurrency('X', { currency: 'CNH' })).toBe('CNY')   // offshore RMB
  })

  it('falls back to the listing suffix before the quote lands', () => {
    expect(holdingCurrency('RY.TO')).toBe('CAD')
    expect(holdingCurrency('0700.HK')).toBe('HKD')
    expect(holdingCurrency('600519.SS')).toBe('CNY')
    expect(holdingCurrency('000001.SZ')).toBe('CNY')
    expect(holdingCurrency('AAPL')).toBe('USD')
  })
})

describe('fmtCcy — money the reader can tell apart', () => {
  it('marks each currency distinctly', () => {
    expect(fmtCcy(1234.5, 'USD')).toBe('$1,235')
    expect(fmtCcy(1234.5, 'CAD')).toBe('C$1,235')
    expect(fmtCcy(1234.5, 'HKD')).toBe('HK$1,235')
    expect(fmtCcy(1234.5, 'CNY')).toBe('¥1,235')
    expect(fmtCcy(null, 'USD')).toBe('—')
  })

  it('keeps cents when asked', () => {
    expect(fmtCcy(12.346, 'USD', 2)).toBe('$12.35')
  })
})
