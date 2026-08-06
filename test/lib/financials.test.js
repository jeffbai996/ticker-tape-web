import { describe, expect, it } from 'vitest'
import { mergeTimeseries, statementRows } from '../../src/lib/financials.js'

// shape mirrors /ws/fundamentals-timeseries results
const series = (type, points) => ({
  meta: { type: [type] },
  timestamp: points.map((p) => p[0]),
  [type]: points.map((p) => (p[1] == null ? null : { asOfDate: p[2] || 'x', reportedValue: { raw: p[1] } })),
})

describe('mergeTimeseries', () => {
  it('joins typed series into per-period rows, ascending', () => {
    const rows = mergeTimeseries([
      series('quarterlyTotalRevenue', [[200, 68e9, '2026-01-31'], [100, 57e9, '2025-10-31']]),
      series('quarterlyNetIncome', [[200, 43e9], [100, 32e9]]),
    ], 'quarterly')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ ts: 100, revenue: 57e9, netIncome: 32e9 })
    expect(rows[1]).toMatchObject({ ts: 200, revenue: 68e9, netIncome: 43e9 })
    expect(rows[1].end).toBe('2026-01-31')
  })

  it('tolerates gaps — a period missing one series still rows up', () => {
    const rows = mergeTimeseries([
      series('quarterlyTotalRevenue', [[100, 57e9]]),
      series('quarterlyFreeCashFlow', [[200, 20e9]]),
    ], 'quarterly')
    expect(rows).toHaveLength(2)
    expect(rows[0].revenue).toBe(57e9)
    expect(rows[0].fcf).toBeUndefined()
    expect(rows[1].fcf).toBe(20e9)
  })

  it('survives an empty payload', () => {
    expect(mergeTimeseries([], 'quarterly')).toEqual([])
    expect(mergeTimeseries(null, 'annual')).toEqual([])
  })
})

describe('statementRows', () => {
  const periods = [
    { ts: 1, end: '2025-04-30', revenue: 44e9, grossProfit: 26e9, netIncome: 18e9, fcf: 26e9, eps: 0.76 },
    { ts: 2, end: '2025-07-31', revenue: 46.7e9, grossProfit: 33e9, netIncome: 26.4e9, fcf: 13.5e9, eps: 1.08 },
    { ts: 3, end: '2026-04-30', revenue: 81.6e9, grossProfit: 58e9, netIncome: 58.3e9, fcf: 26.1e9, eps: 2.39 },
  ]

  it('derives margins and growth vs the same quarter a year back', () => {
    const rows = statementRows(periods)
    const rev = rows.find((r) => r.key === 'revenue')
    expect(rev.cells[2].v).toBe(81.6e9)
    // 81.6 vs 44 a year earlier ≈ +85.5%
    expect(rev.cells[2].growth).toBeCloseTo(85.45, 1)
    expect(rev.cells[1].growth).toBeNull()          // no quarter a year back
    const gm = rows.find((r) => r.key === 'grossMargin')
    expect(gm.cells[2].v).toBeCloseTo(58 / 81.6 * 100, 1)
  })

  it('keeps rows whose data exists and drops the all-empty ones', () => {
    const rows = statementRows(periods.map(({ fcf, ...rest }) => rest))
    expect(rows.some((r) => r.key === 'fcf')).toBe(false)
    expect(rows.some((r) => r.key === 'eps')).toBe(true)
  })
})
