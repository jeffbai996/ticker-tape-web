/** The 净值 line: marks in, aligned normalised series out — pure. */
import { describe, expect, it } from 'vitest'
import { alignToDates, barDate, buildPerformance, normalizeTo100, spanReturn } from '../../src/lib/performance.js'

describe('barDate', () => {
  it('reads ms, seconds and strings', () => {
    expect(barDate({ t: Date.UTC(2026, 7, 21) })).toBe('2026-08-21')
    expect(barDate({ time: Date.UTC(2026, 7, 21) / 1000 })).toBe('2026-08-21')
    expect(barDate({ date: '2026-08-21T00:00:00Z' })).toBe('2026-08-21')
    expect(barDate({})).toBeNull()
  })
})

describe('alignToDates', () => {
  it('carries the last close forward across the other market\'s holiday', () => {
    const bars = [{ t: Date.UTC(2026, 7, 18), close: 100 }, { t: Date.UTC(2026, 7, 20), close: 110 }]
    expect(alignToDates(bars, ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']))
      .toEqual([null, 100, 100, 110, 110])
  })
})

describe('normalizeTo100 / spanReturn', () => {
  it('starts at 100 on the first finite value and keeps gaps', () => {
    expect(normalizeTo100([null, 50, 55, null, 60])).toEqual([null, 100, 110, null, 120])
    expect(normalizeTo100([null, null])).toEqual([null, null])
    expect(spanReturn([50, 55, 60])).toBeCloseTo(20)
    expect(spanReturn([50])).toBeNull()
  })
})

describe('buildPerformance', () => {
  it('puts the book first and every benchmark on the mark dates', () => {
    const snaps = [{ d: '2026-08-18', v: 1000, c: 'CNY' }, { d: '2026-08-19', v: 1020, c: 'CNY' }, { d: '2026-08-21', v: 990, c: 'CNY' }]
    const out = buildPerformance(snaps, [{ id: 'hsi', label: 'HSI', bars: [
      { t: Date.UTC(2026, 7, 18), close: 200 }, { t: Date.UTC(2026, 7, 19), close: 204 }, { t: Date.UTC(2026, 7, 20), close: 210 }, { t: Date.UTC(2026, 7, 21), close: 208 }] }])
    expect(out.dates).toEqual(['2026-08-18', '2026-08-19', '2026-08-21'])
    expect(out.series[0]).toMatchObject({ id: 'book', values: [100, 102, 99] })
    expect(out.series[0].ret).toBeCloseTo(-1)
    expect(out.series[1].values.map((v) => Math.round(v))).toEqual([100, 102, 104])
  })

  it('is empty, not broken, with no marks', () => {
    const out = buildPerformance([], [{ id: 'x', label: 'X', bars: [] }])
    expect(out.dates).toEqual([])
    expect(out.series[0].ret).toBeNull()
  })

  it('removes deposits and withdrawals from the book return', () => {
    const snaps = [
      { d: '2026-08-20', v: 1_000, c: 'USD' },
      { d: '2026-08-21', v: 1_600, c: 'USD' },
      { d: '2026-08-22', v: 1_440, c: 'USD' },
    ]
    const cashTxns = [
      { id: 'c1', d: '2026-08-21', kind: 'deposit', ccy: 'USD', amount: 500, bookAmount: 500, bookCcy: 'USD' },
      { id: 'c2', d: '2026-08-22', kind: 'withdrawal', ccy: 'USD', amount: -200, bookAmount: -200, bookCcy: 'USD' },
      { id: 'c3', d: '2026-08-22', kind: 'trade', ccy: 'USD', amount: -300, bookAmount: -300, bookCcy: 'USD' },
    ]
    const out = buildPerformance(snaps, [], cashTxns, 'USD')
    expect(out.series[0].values[0]).toBe(100)
    expect(out.series[0].values[1]).toBeCloseTo(110)
    expect(out.series[0].values[2]).toBeCloseTo(112.75)
    expect(out.series[0].ret).toBeCloseTo(12.75)
  })
})
