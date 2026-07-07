// Backtest core — port-parity tests against the CLI's hand-computed cases.
import { describe, it, expect } from 'vitest'
import {
  parseFillsCsv,
  assembleBacktest,
  convertFills,
  convertBars,
  needsFx,
  symbolCurrency,
} from '../../src/lib/backtest.js'

const FX = { '2022-01-03': 1.25, '2022-01-04': 1.3, '2022-01-06': 1.4 }

describe('parseFillsCsv', () => {
  it('parses the shared ledger format', () => {
    const fills = parseFillsCsv(
      'date,symbol,side,qty,price\n2022-03-15,MSFT,BUY,100,250.50\n2024-06-01,MSFT,SELL,40,420.00\n',
    )
    expect(fills).toHaveLength(2)
    expect(fills[0]).toMatchObject({ date: '2022-03-15', symbol: 'MSFT', side: 'BUY', qty: 100, price: 250.5, currency: 'USD' })
    expect(fills[1].side).toBe('SELL')
  })

  it('reads the optional currency column and defaults USD', () => {
    const fills = parseFillsCsv(
      'date,symbol,side,qty,price,currency\n2023-01-10,AAPL.NE,BUY,500,25.10,cad\n2023-01-11,MSFT,BUY,1,300,\n',
    )
    expect(fills[0].currency).toBe('CAD')
    expect(fills[1].currency).toBe('USD')
  })

  it('skips malformed rows without failing', () => {
    const fills = parseFillsCsv(
      'date,symbol,side,qty,price\ngarbage,row,here\n2022-bad,MSFT,BUY,1,1\n2022-03-15,MSFT,HOLD,1,1\n2022-03-15,MSFT,BUY,0,1\n2022-03-15,MSFT,BUY,10,25\n',
    )
    expect(fills).toHaveLength(1)
  })

  it('returns [] for empty or headerless input', () => {
    expect(parseFillsCsv('')).toEqual([])
    expect(parseFillsCsv('a,b,c\n1,2,3\n')).toEqual([])
  })
})

describe('assembleBacktest', () => {
  it('reconstructs equity with avg-cost partial exits (hand-computed)', () => {
    // 1/3: BUY 10 @ 100 → basis 1000, close 100 → equity 1000
    // 1/4: close 110 → equity 1100
    // 1/6: SELL 4 @ 120 → realized 4×20=80; close 120 → unrealized 6×20=120 → equity 1200
    const fills = [
      { date: '2022-01-03', symbol: 'MSFT', side: 'BUY', qty: 10, price: 100 },
      { date: '2022-01-06', symbol: 'MSFT', side: 'SELL', qty: 4, price: 120 },
    ]
    const bars = { MSFT: { '2022-01-03': 100, '2022-01-04': 110, '2022-01-06': 120 } }
    const r = assembleBacktest(fills, bars, {})
    expect(r.book).toEqual([1000, 1100, 1200])
    expect(r.stats.benchmarkReturnPct).toBeNull()
    expect(r.stats.alphaPct).toBeNull()
  })

  it('carries last-known price over a feed gap, never dropping to 0', () => {
    const fills = [{ date: '2022-01-03', symbol: 'MSFT', side: 'BUY', qty: 10, price: 100 }]
    const bars = { MSFT: { '2022-01-03': 100 } }
    const benchmark = { '2022-01-03': 50, '2022-01-04': 55 }
    const r = assembleBacktest(fills, bars, benchmark)
    expect(r.book[1]).toBe(1000) // 1/4 has no MSFT bar → carried at 100
  })

  it('normalizes the benchmark to the book start so the gap is alpha', () => {
    const fills = [{ date: '2022-01-03', symbol: 'MSFT', side: 'BUY', qty: 10, price: 100 }]
    const bars = { MSFT: { '2022-01-03': 100, '2022-01-04': 110 } }
    const benchmark = { '2022-01-03': 50, '2022-01-04': 51 }
    const r = assembleBacktest(fills, bars, benchmark)
    expect(r.bench[0]).toBe(1000)
    expect(r.bench[1]).toBeCloseTo(1020)
    expect(r.stats.bookReturnPct).toBeCloseTo(10)
    expect(r.stats.benchmarkReturnPct).toBeCloseTo(2)
    expect(r.stats.alphaPct).toBeCloseTo(8)
  })

  it('computes max drawdown vs the running peak', () => {
    const fills = [{ date: '2022-01-03', symbol: 'MSFT', side: 'BUY', qty: 10, price: 100 }]
    const bars = { MSFT: { '2022-01-03': 100, '2022-01-04': 120, '2022-01-05': 90, '2022-01-06': 110 } }
    const r = assembleBacktest(fills, bars, {})
    expect(r.stats.maxDrawdownPct).toBeCloseTo(-25) // 1200 → 900
  })

  it('yields an empty result for an empty book', () => {
    const r = assembleBacktest([], {}, {})
    expect(r.dates).toEqual([])
    expect(r.stats).toBeNull()
  })
})

describe('FX normalization', () => {
  it('converts CAD fills at the fill-date rate', () => {
    const fills = [{ date: '2022-01-03', symbol: 'AAPL.NE', side: 'BUY', qty: 100, price: 25, currency: 'CAD' }]
    expect(convertFills(fills, 'USD', FX)[0].price).toBeCloseTo(20) // 25 / 1.25
  })

  it('converts USD fills to CAD', () => {
    const fills = [{ date: '2022-01-04', symbol: 'MSFT', side: 'BUY', qty: 10, price: 100, currency: 'USD' }]
    expect(convertFills(fills, 'CAD', FX)[0].price).toBeCloseTo(130)
  })

  it('carries the last-known rate over an FX gap', () => {
    const fills = [{ date: '2022-01-05', symbol: 'AAPL.NE', side: 'BUY', qty: 10, price: 26, currency: 'CAD' }]
    expect(convertFills(fills, 'USD', FX)[0].price).toBeCloseTo(20) // 26 / 1.30 (1/4 rate)
  })

  it('uses the first available rate before the series starts', () => {
    const fills = [{ date: '2022-01-01', symbol: 'AAPL.NE', side: 'BUY', qty: 10, price: 25, currency: 'CAD' }]
    expect(convertFills(fills, 'USD', FX)[0].price).toBeCloseTo(20) // 1/3 rate
  })

  it('throws when conversion is needed but FX data is empty', () => {
    const fills = [{ date: '2022-01-03', symbol: 'AAPL.NE', side: 'BUY', qty: 10, price: 25, currency: 'CAD' }]
    expect(() => convertFills(fills, 'USD', {})).toThrow()
  })

  it('converts bars day by day, each at its own rate', () => {
    const bars = { 'AAPL.NE': { '2022-01-03': 25, '2022-01-04': 26 } }
    const out = convertBars(bars, { 'AAPL.NE': 'CAD' }, 'USD', FX)
    expect(out['AAPL.NE']['2022-01-03']).toBeCloseTo(20)
    expect(out['AAPL.NE']['2022-01-04']).toBeCloseTo(20)
  })

  it('infers currency from the yfinance suffix', () => {
    expect(symbolCurrency('AAPL.NE')).toBe('CAD')
    expect(symbolCurrency('VFV.TO')).toBe('CAD')
    expect(symbolCurrency('QQQ')).toBe('USD')
  })

  it('needsFx only when currencies actually mix', () => {
    const usd = [{ date: '2022-01-03', symbol: 'MSFT', side: 'BUY', qty: 1, price: 1, currency: 'USD' }]
    expect(needsFx(usd, 'USD', 'USD')).toBe(false)
    expect(needsFx(usd, 'CAD', 'USD')).toBe(true)
  })

  it('mixed-currency book matches the hand-computed equity', () => {
    // same case as the CLI test: USD book + one CAD position, reported in USD
    const fills = [
      { date: '2022-01-03', symbol: 'MSFT', side: 'BUY', qty: 10, price: 100, currency: 'USD' },
      { date: '2022-01-03', symbol: 'CDR.NE', side: 'BUY', qty: 100, price: 25, currency: 'CAD' },
    ]
    const barsNative = {
      MSFT: { '2022-01-03': 100, '2022-01-04': 110 },
      'CDR.NE': { '2022-01-03': 25, '2022-01-04': 26 },
    }
    const converted = convertBars(barsNative, { MSFT: 'USD', 'CDR.NE': 'CAD' }, 'USD', FX)
    const r = assembleBacktest(convertFills(fills, 'USD', FX), converted, { '2022-01-03': 100, '2022-01-04': 101 })
    expect(r.book[0]).toBeCloseTo(3000)
    expect(r.book[1]).toBeCloseTo(3100)
  })
})
