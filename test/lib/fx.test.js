/** Multi-currency portfolios (Jeff 2026-08-20): a book can hold USD, CAD,
 *  HKD and CNY names at once, and each portfolio picks its own display
 *  currency. All conversion goes through live Yahoo FX pairs quoted against
 *  USD — one hop to USD, one hop out — so four currencies need three pairs,
 *  not six.
 */
import { describe, expect, it } from 'vitest'
import { cashAccountName, ccyMark, fmtCcyZh,
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

  // A book is allowed to hold a Tokyo or Seoul line even though neither is a
  // display currency; the rate table has to cover whatever is actually held
  // or those rows dash out forever.
  it('reads any USD pair in the map, not just the display currencies', () => {
    const live = {
      'JPYUSD=X': { quote: { price: 0.0064 } },
      'KRWUSD=X': { quote: { price: 0.00072 } },
      'AAPL': { quote: { price: 230 } },
    }
    expect(ratesFromQuotes(live)).toEqual({ USD: 1, JPY: 0.0064, KRW: 0.00072 })
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

  // Jeff 2026-08-21: "a HK stock should only be in HKD, shouldn't be able to
  // set it to USD" — currency is a property of the listing, never a choice.
  it('reads the venue for the markets beyond the four display currencies', () => {
    expect(holdingCurrency('7203.T')).toBe('JPY')
    expect(holdingCurrency('000660.KS')).toBe('KRW')
    expect(holdingCurrency('ASML.AS')).toBe('EUR')
    expect(holdingCurrency('SHEL.L')).toBe('GBP')
    expect(holdingCurrency('2330.TW')).toBe('TWD')
    expect(holdingCurrency('SHOP.NE')).toBe('CAD')
  })

  it('lets the quote overrule a suffix guess, never the other way round', () => {
    // a Shanghai line quoted in offshore RMB still reports one currency
    expect(holdingCurrency('0700.HK', { currency: 'USD' })).toBe('USD')
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

describe('ccyMark — foreign listings wear their symbol', () => {
  it('marks the non-home currencies, three chars max', () => {
    expect(ccyMark('KRW')).toBe('₩')
    expect(ccyMark('JPY')).toBe('¥')
    expect(ccyMark('CNH')).toBe('¥')
    expect(ccyMark('HKD')).toBe('HK$')
    expect(ccyMark('TWD')).toBe('NT$')
    for (const c of ['KRW','JPY','HKD','TWD','EUR','GBP','CHF','INR','SGD','AUD']) {
      expect(ccyMark(c).length).toBeLessThanOrEqual(3)
    }
  })
  it('home currencies and unknowns stay bare', () => {
    expect(ccyMark('USD')).toBe('')
    expect(ccyMark('CAD')).toBe('')
    expect(ccyMark('XYZ')).toBe('')
    expect(ccyMark(null)).toBe('')
  })
})

describe('cashAccountName — a cash row says which money it is', () => {
  it('names the currency rather than repeating "Cash"', () => {
    expect(cashAccountName('USD')).toBe('US Dollar Cash')
    expect(cashAccountName('CAD')).toBe('Canadian Dollar Cash')
    expect(cashAccountName('HKD')).toBe('Hong Kong Dollar Cash')
    expect(cashAccountName('cny')).toBe('Chinese Yuan Cash')
  })

  it('falls back rather than render undefined', () => {
    expect(cashAccountName('GBP')).toBe('Cash')
    expect(cashAccountName()).toBe('Cash')
  })
})

describe('fmtCcyZh — 万/亿 grouping for a Chinese reader', () => {
  it('groups by 万 and 亿 with two decimals, plain below 1万', () => {
    expect(fmtCcyZh(54128742, 'CNY')).toBe('¥5,412.87万')
    expect(fmtCcyZh(123456789, 'CNY')).toBe('¥1.23亿')
    expect(fmtCcyZh(9876, 'HKD')).toBe('HK$9,876')
    expect(fmtCcyZh(1788003, 'CNY')).toBe('¥178.80万')
  })

  it('keeps the sign in front of the mark and survives nothing', () => {
    expect(fmtCcyZh(-2500000, 'CNY')).toBe('-¥250.00万')
    expect(fmtCcyZh(null, 'CNY')).toBe('—')
  })
})
