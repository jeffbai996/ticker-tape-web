import { describe, expect, it } from 'vitest'
import { sortRows } from '../../src/lib/bookStats.js'

const rows = [
  { symbol: 'B', ccy: 'HKD', shares: 10, cost: 5, price: 2, dayPct: -1, valueDisplay: 20, weightPct: 20, unrealDisplay: null },
  { symbol: 'A', ccy: 'CNY', shares: 30, cost: null, price: null, dayPct: null, valueDisplay: null, weightPct: null, unrealDisplay: null },
  { symbol: 'C', ccy: 'USD', shares: 20, cost: 1, price: 4, dayPct: 3, valueDisplay: 80, weightPct: 80, unrealDisplay: 60 },
]

describe('sortRows', () => {
  it('rests in venue order without a key — venues grouped, codes ascending', () => {
    // suffix-less rows all land in the same venue group and keep a stable
    // alphabetical order (Gordon 2026-08-23: 港股/A股 grouped, 由小到大)
    expect(sortRows(rows, null, null).map((r) => r.symbol)).toEqual(['A', 'B', 'C'])
    expect(sortRows(rows, 'value', null).map((r) => r.symbol)).toEqual(['A', 'B', 'C'])
  })
  it('sorts numbers and sinks unpriced rows to the bottom both ways', () => {
    expect(sortRows(rows, 'value', 'desc').map((r) => r.symbol)).toEqual(['C', 'B', 'A'])
    expect(sortRows(rows, 'value', 'asc').map((r) => r.symbol)).toEqual(['B', 'C', 'A'])
  })
  it('sorts names alphabetically', () => {
    expect(sortRows(rows, 'symbol', 'asc').map((r) => r.symbol)).toEqual(['A', 'B', 'C'])
    expect(sortRows(rows, 'ccy', 'desc').map((r) => r.ccy)).toEqual(['USD', 'HKD', 'CNY'])
  })
  it('does not mutate the input', () => {
    const before = rows.map((r) => r.symbol)
    sortRows(rows, 'shares', 'desc')
    expect(rows.map((r) => r.symbol)).toEqual(before)
  })
})
