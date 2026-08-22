/** Broker exports in, trades out — by synonym, never by guess. */
import { describe, expect, it } from 'vitest'
import { normalizeDate, normalizeSide, normalizeTradeSymbol, parseTradesCsv } from '../../src/lib/tradeCsv.js'

describe('normalizers', () => {
  it('reads 富途 venue prefixes, bare codes and US tickers', () => {
    expect(normalizeTradeSymbol('HK.00700')).toBe('0700.HK')
    expect(normalizeTradeSymbol('SH.600036')).toBe('600036.SS')
    expect(normalizeTradeSymbol('SZ.000630')).toBe('000630.SZ')
    expect(normalizeTradeSymbol('US.AAPL')).toBe('AAPL')
    expect(normalizeTradeSymbol('00700')).toBe('0700.HK')
    expect(normalizeTradeSymbol('aapl')).toBe('AAPL')
  })
  it('reads sides in three scripts and from a signed quantity', () => {
    expect(normalizeSide('买入')).toBe('buy'); expect(normalizeSide('賣出')).toBe('sell')
    expect(normalizeSide('BUY')).toBe('buy'); expect(normalizeSide('SLD')).toBe('sell')
    expect(normalizeSide('', -5)).toBe('sell'); expect(normalizeSide('', 5)).toBe('buy')
    expect(normalizeSide('transfer')).toBeNull()
  })
  it('reads dates in the forms brokers print', () => {
    expect(normalizeDate('2026-08-21 14:03:11')).toBe('2026-08-21')
    expect(normalizeDate('2026/8/5')).toBe('2026-08-05')
    expect(normalizeDate('20260821')).toBe('2026-08-21')
    expect(normalizeDate('8/21/2026')).toBe('2026-08-21')
    expect(normalizeDate('yesterday')).toBeNull()
  })
})

describe('parseTradesCsv', () => {
  it('parses a 富途-style export with Chinese headers', () => {
    const csv = '代码,名称,方向,成交数量,成交价格,成交时间,手续费,币种\nHK.00700,腾讯控股,买入,100,457.00,2026-08-20 10:01:00,12.5,HKD\nHK.02628,中国人寿,卖出,"1,000",28.06,2026-08-21 15:59:00,8,HKD\n'
    const out = parseTradesCsv(csv)
    expect(out.errors).toEqual([])
    expect(out.rows).toEqual([
      { d: '2026-08-20', sym: '0700.HK', side: 'buy', qty: 100, px: 457, fee: 12.5, ccy: 'HKD' },
      { d: '2026-08-21', sym: '2628.HK', side: 'sell', qty: 1000, px: 28.06, fee: 8, ccy: 'HKD' },
    ])
  })

  it('parses an IBKR Flex trades export — sells are negative quantities', () => {
    const csv = 'Symbol,TradeDate,Quantity,TradePrice,IBCommission,CurrencyPrimary\nAAPL,20260820,10,180.5,-1,USD\nAAPL,20260821,-5,185,-1,USD\n'
    const out = parseTradesCsv(csv)
    expect(out.rows.map((r) => [r.sym, r.side, r.qty, r.fee])).toEqual([['AAPL', 'buy', 10, 1], ['AAPL', 'sell', 5, 1]])
  })

  it('accepts tabs and reports the rows it cannot place, by line', () => {
    const tsv = '证券代码\t买卖\t成交数量\t成交价\t成交日期\n600036\t买入\t300\t38.9\t2026-08-20\n600489\t转托管\t100\t27\t2026-08-20\n000630\t卖出\t0\t6.5\t2026-08-21\n'
    const out = parseTradesCsv(tsv)
    expect(out.rows).toEqual([{ d: '2026-08-20', sym: '600036.SS', side: 'buy', qty: 300, px: 38.9, fee: 0 }])
    expect(out.errors).toEqual([{ line: 3, reason: 'side' }, { line: 4, reason: 'quantity' }])
  })

  it('says which column is missing rather than importing garbage', () => {
    const out = parseTradesCsv('name,side\nx,buy\n')
    expect(out.rows).toEqual([])
    expect(out.errors[0].reason).toMatch(/missing column/)
  })
})
