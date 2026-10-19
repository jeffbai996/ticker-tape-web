import { describe, expect, it } from 'vitest'
import { compareVisual, portfolioVisual, priceVisual } from '../../src/lib/chatVisuals.js'
import { validateBlock } from '../../src/lib/chatBlocks.js'

const day = (d, close) => ({ time: Date.parse(`${d}T14:30:00Z`) / 1000, close, open: close, high: close, low: close, volume: 1 })
const histories = {
  AAPL: { quote: { currency: 'USD', name: 'Apple' }, bars: [day('2026-01-02', 100), day('2026-01-05', 110), day('2026-01-06', 99)] },
  MSFT: { quote: { currency: 'USD' }, bars: [day('2026-01-05', 400), day('2026-01-06', 420), day('2026-01-07', 410)] },
}
const history = async (symbol, range) => {
  if (!histories[symbol]) throw new Error('404')
  return { ...histories[symbol], range }
}

describe('compareVisual', () => {
  it('builds an indexed comparison bound to real bars, with honest baseline, gaps and failures', async () => {
    const out = await compareVisual({ symbols: ['aapl', 'MSFT', 'NOPE', 'AAPL'], range: '3M' }, { history, locale: 'en', now: 5 })
    expect(validateBlock(out.block).ok).toBe(true)
    expect(out.block.type).toBe('line')
    expect(out.block.dates).toEqual(['2026-01-05', '2026-01-06', '2026-01-07'])
    expect(out.block.series.map((s) => s.values)).toEqual([[100, 90, null], [100, 105, 102.5]])
    expect(out.block.unit).toEqual({ kind: 'index', baseline: 100, digits: 1 })
    expect(out.block.source).toEqual({ tool: 'chart_compare', provider: 'Yahoo Finance', asOf: 5, range: '3M', baselineDate: '2026-01-05' })
    expect(out.block.notes.join(' ')).toMatch(/AAPL: 1 sessions/)
    expect(out.block.notes.join(' ')).toMatch(/No history for NOPE/)
    expect(out.summary.series).toEqual([
      expect.objectContaining({ symbol: 'AAPL', return_pct: -10, missing_sessions: 1 }),
      expect.objectContaining({ symbol: 'MSFT', return_pct: 2.5, high: { date: '2026-01-06', value: 105 } }),
    ])
    expect(out.summary.failed).toEqual(['NOPE'])
  })
  it('offers the same figures as a table and refuses junk input', async () => {
    const table = await compareVisual({ symbols: 'AAPL MSFT', view: 'table' }, { history, locale: 'zh' })
    expect(table.block.type).toBe('table')
    expect(table.block.rows[0][0]).toBe('AAPL')
    expect(table.block.rows[0][1]).toBe(-10)
    expect(table.block.columns[1].label).toBe('收益 %')
    expect((await compareVisual({ symbols: ['$$'] }, { history })).summary.error).toMatch(/tickers/)
    expect((await compareVisual({ symbols: ['NOPE'] }, { history })).summary.error).toMatch(/no price history/)
    expect((await compareVisual({ symbols: ['NOPE'] }, { history })).block).toBeUndefined()
  })
  it('reports no shared session instead of inventing an overlap', async () => {
    const apart = async (s) => ({ bars: [day(s === 'A' ? '2026-01-02' : '2026-01-03', 1)] })
    expect((await compareVisual({ symbols: ['A', 'B'] }, { history: apart })).summary.error).toMatch(/no trading session/)
  })
})

describe('portfolioVisual', () => {
  const book = { id: 'book-2', name: 'Example income', ccy: 'CAD', holdings: [], cash: [] }
  const valued = {
    rows: [
      { kind: 'equity', symbol: 'AAPL', ccy: 'USD', valueDisplay: 6000, dayPnlDisplay: 120.456, dayPct: 2.05, weightPct: 60 },
      { kind: 'equity', symbol: 'MSFT', ccy: 'USD', valueDisplay: 3000, dayPnlDisplay: -45, dayPct: -1.5, weightPct: 30 },
      { kind: 'equity', symbol: 'XYZ', ccy: 'USD', valueDisplay: null, dayPnlDisplay: null, dayPct: null, weightPct: null },
      { kind: 'cash', symbol: 'CASH.CAD', ccy: 'CAD', valueDisplay: 1000, dayPnlDisplay: null, dayPct: null, weightPct: 10 },
    ],
    missing: ['XYZ'], total: { value: 10000, dayPnl: 75.456, dayPct: 0.76 }, quotes: { AAPL: { name: 'Apple' } }, as_of: 1_700_000_000, stale: [], failed: [],
  }
  const services = { locale: 'en', waitSync: async () => {}, findBook: (selector) => (selector === 'book-2' ? { book } : { error: 'portfolio not found', choices: [] }), priceBook: async () => valued, now: 7 }

  it('reads the explicitly named book and ranks signed day contributors in its currency', async () => {
    const out = await portfolioVisual({ portfolio: 'book-2', view: 'contributors' }, services)
    expect(validateBlock(out.block).ok).toBe(true)
    expect(out.block.title).toBe('Example income · today’s contributors')
    expect(out.block.unit).toEqual({ kind: 'ccy', currency: 'CAD', digits: 0 })
    expect(out.block.signed).toBe(true)
    expect(out.block.items).toEqual([
      { key: 'AAPL', label: 'Apple', value: 120.46, pct: 2.05 },
      { key: 'MSFT', label: 'MSFT', value: -45, pct: -1.5 },
      { key: 'XYZ', label: 'XYZ', value: null, note: 'no price' },
    ])
    expect(out.block.subtitle).toBe('Day P&L +C$75 (+0.76%)')
    expect(out.block.notes[0]).toMatch(/Unpriced: XYZ/)
    expect(out.block.source).toEqual({ tool: 'chart_portfolio', provider: 'Saved portfolio valued with app quotes and FX', asOf: 1_700_000_000_000, portfolioId: 'book-2' })
    expect(out.summary.portfolio).toEqual({ id: 'book-2', name: 'Example income', currency: 'CAD' })
    expect(out.summary.top_negative).toEqual([{ symbol: 'MSFT', day_pnl: -45, day_pct: -1.5 }])
    expect(out.summary.unpriced).toEqual(['XYZ'])
  })
  it('shows allocation with cash and unpriced names listed rather than dropped', async () => {
    const out = await portfolioVisual({ portfolio: 'book-2', view: 'allocation' }, services)
    expect(out.block.items.map((i) => [i.key, i.value])).toEqual([['AAPL', 60], ['MSFT', 30], ['CASH.CAD', 10], ['XYZ', null]])
    expect(out.block.items[2].note).toBe('cash')
    expect(out.block.items[3].note).toBe('unpriced')
    expect(out.block.subtitle).toMatch(/unpriced excluded/)
    expect(out.summary).toMatchObject({ top1_pct: 60, top3_pct: 100, complete: false })
  })
  it('aggregates currency exposure from priced rows', async () => {
    const out = await portfolioVisual({ portfolio: 'book-2', view: 'currency' }, services)
    expect(out.block.items).toEqual([{ key: 'USD', label: 'USD', value: 90 }, { key: 'CAD', label: 'CAD', value: 10 }])
  })
  it('never substitutes another book for an unknown selector', async () => {
    const out = await portfolioVisual({ portfolio: 'Example growth' }, services)
    expect(out.summary.error).toBe('portfolio not found')
    expect(out.block).toBeUndefined()
  })
})

describe('priceVisual', () => {
  it('draws dated closes with the period high and low', async () => {
    const out = await priceVisual({ symbol: 'aapl', range: '1M' }, { history, locale: 'en', now: 3 })
    expect(validateBlock(out.block).ok).toBe(true)
    expect(out.block.title).toBe('Apple · close')
    expect(out.block.unit).toEqual({ kind: 'price', currency: 'USD', digits: 2 })
    expect(out.block.series[0].values).toEqual([100, 110, 99])
    expect(out.summary).toMatchObject({ symbol: 'AAPL', return_pct: -1, high: { date: '2026-01-05', close: 110 }, low: { date: '2026-01-06', close: 99 } })
    expect((await priceVisual({ symbol: 'NOPE' }, { history })).summary.error).toMatch(/no price history/)
  })
})
