/** Koyfin-style "my portfolios" (Jeff 2026-08-20): several hand-built books,
 *  each with its own display currency chosen at creation, holdings in any of
 *  USD/CAD/HKD/CNY, valued live. Client-side only — the site is static, so
 *  localStorage is the book of record and nothing ever leaves the browser.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_MY_PORTFOLIOS, MAX_MY_HOLDINGS,
  createPortfolio, deletePortfolio, loadPortfolios, onPortfoliosChange,
  portfolioValues, removeHolding, renamePortfolio, setHolding,
} from '../../src/lib/myPortfolios.js'

beforeEach(() => localStorage.clear())

describe('the store', () => {
  it('creates a portfolio with a chosen display currency and persists it', () => {
    const p = createPortfolio('HK income', 'HKD')
    expect(p).toMatchObject({ name: 'HK income', ccy: 'HKD', holdings: [] })
    expect(loadPortfolios().find((x) => x.id === p.id).ccy).toBe('HKD')
  })

  it('refuses a currency outside the supported set and a blank name', () => {
    expect(createPortfolio('Bad', 'GBP')).toBeNull()
    expect(createPortfolio('   ', 'USD')).toBeNull()
  })

  it('upserts holdings: add, restate shares, never duplicate a symbol', () => {
    const p = createPortfolio('Core', 'USD')
    expect(setHolding(p.id, 'aapl', 10)).toMatchObject({ symbol: 'AAPL', shares: 10 })
    setHolding(p.id, 'AAPL', 25, 180)
    const held = loadPortfolios().find((x) => x.id === p.id).holdings
    expect(held).toEqual([{ symbol: 'AAPL', shares: 25, cost: 180 }])
  })

  it('rejects nonsense holdings instead of storing them', () => {
    const p = createPortfolio('Core', 'USD')
    expect(setHolding(p.id, '', 10)).toBeNull()
    expect(setHolding(p.id, 'AAPL', 0)).toBeNull()
    expect(setHolding(p.id, 'AAPL', -5)).toBeNull()
    expect(setHolding(p.id, 'AAPL', Infinity)).toBeNull()
    expect(setHolding('nope', 'AAPL', 1)).toBeNull()
  })

  it('removes holdings and whole portfolios, and renames in place', () => {
    const p = createPortfolio('Old name', 'CAD')
    setHolding(p.id, 'RY.TO', 20)
    removeHolding(p.id, 'RY.TO')
    expect(loadPortfolios().find((x) => x.id === p.id).holdings).toEqual([])
    renamePortfolio(p.id, 'New name')
    expect(loadPortfolios().find((x) => x.id === p.id).name).toBe('New name')
    deletePortfolio(p.id)
    expect(loadPortfolios().some((x) => x.id === p.id)).toBe(false)
  })

  it('notifies subscribers on every mutation', () => {
    const seen = []
    const off = onPortfoliosChange((items) => seen.push(items.length))
    const p = createPortfolio('Ping', 'USD')
    setHolding(p.id, 'MSFT', 3)
    deletePortfolio(p.id)
    off()
    createPortfolio('Silent', 'USD')
    expect(seen.length).toBe(3)
  })

  it('caps portfolios and holdings so the feed cannot be flooded', () => {
    for (let i = 0; i < MAX_MY_PORTFOLIOS + 3; i++) createPortfolio(`P${i}`, 'USD')
    expect(loadPortfolios().length).toBeLessThanOrEqual(MAX_MY_PORTFOLIOS)
    const p = loadPortfolios()[0]
    for (let i = 0; i < MAX_MY_HOLDINGS + 5; i++) setHolding(p.id, `T${i}`, 1)
    expect(loadPortfolios()[0].holdings.length).toBeLessThanOrEqual(MAX_MY_HOLDINGS)
  })

  it('seeds a sample multi-currency book on first run, and stays deleted once deleted', () => {
    const first = loadPortfolios()
    expect(first.length).toBe(1)
    expect(first[0].holdings.length).toBeGreaterThanOrEqual(3)
    const ccys = new Set(first[0].holdings.map((h) => h.symbol.split('.')[1] || 'US'))
    expect(ccys.size).toBeGreaterThan(1)          // genuinely multi-market
    deletePortfolio(first[0].id)
    expect(loadPortfolios()).toEqual([])          // no resurrection
  })

  it('survives corrupted storage', () => {
    localStorage.setItem('my_portfolios_v1', '{not json')
    expect(loadPortfolios()).toEqual([])
  })
})

describe('portfolioValues — the live math', () => {
  const rates = { USD: 1, CAD: 0.8, HKD: 0.125, CNY: 0.14 }
  const quotes = {
    AAPL: { price: 200, pct: 2, currency: 'USD' },
    'RY.TO': { price: 150, pct: -1, currency: 'CAD' },
    '0700.HK': { price: 400, pct: 0, currency: 'HKD' },
  }
  const holdings = [
    { symbol: 'AAPL', shares: 10, cost: 100 },
    { symbol: 'RY.TO', shares: 20 },
    { symbol: '0700.HK', shares: 100 },
  ]

  it('values every holding in the display currency and totals them', () => {
    const v = portfolioValues(holdings, quotes, rates, 'USD')
    // AAPL 2000 USD; RY.TO 3000 CAD -> 2400; 0700 40000 HKD -> 5000
    expect(v.rows.map((r) => r.valueDisplay)).toEqual([2000, 2400, 5000])
    expect(v.total.value).toBe(9400)
    expect(v.rows[0].weightPct).toBeCloseTo((2000 / 9400) * 100)
  })

  it('converts into a non-USD display currency', () => {
    const v = portfolioValues(holdings.slice(0, 1), quotes, rates, 'CAD')
    expect(v.rows[0].valueDisplay).toBeCloseTo(2500)   // 2000 USD / 0.8
  })

  it('carries day P&L through the conversion and totals a day percent', () => {
    const v = portfolioValues(holdings, quotes, rates, 'USD')
    // AAPL +2% on 2000 -> base 1960.78..; RY.TO -1% on 2400; 0700 flat
    expect(v.total.dayPnl).toBeCloseTo(2000 - 2000 / 1.02 + (2400 - 2400 / 0.99), 6)
    expect(v.total.dayPct).toBeCloseTo((v.total.dayPnl / (v.total.value - v.total.dayPnl)) * 100)
  })

  it('shows unrealized P&L only where a cost basis exists', () => {
    const v = portfolioValues(holdings, quotes, rates, 'USD')
    expect(v.rows[0].unrealDisplay).toBe(1000)         // (200-100)*10 USD
    expect(v.rows[1].unrealDisplay).toBeNull()
    expect(v.total.unrealPnl).toBe(1000)
  })

  it('marks unpriced rows and keeps them out of the totals', () => {
    const v = portfolioValues([...holdings, { symbol: 'MISSING', shares: 5 }], quotes, rates, 'USD')
    expect(v.missing).toEqual(['MISSING'])
    expect(v.total.value).toBe(9400)
  })

  it('treats a missing FX rate as unpriced, not as 1:1', () => {
    const v = portfolioValues(holdings, { AAPL: quotes.AAPL, 'RY.TO': quotes['RY.TO'] }, { USD: 1 }, 'USD')
    expect(v.missing).toContain('RY.TO')
    expect(v.total.value).toBe(2000)
  })

  it('values at the latest print when extended hours are trading', () => {
    const v = portfolioValues([{ symbol: 'AAPL', shares: 10 }],
      { AAPL: { price: 200, pct: 2, extLabel: 'PM', extPrice: 210, extPct: 5, currency: 'USD' } },
      rates, 'USD')
    expect(v.rows[0].valueDisplay).toBe(2100)
    expect(v.rows[0].dayPct).toBe(5)                   // sessionDayPct semantics
  })
})
