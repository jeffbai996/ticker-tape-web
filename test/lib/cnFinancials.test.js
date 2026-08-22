/** Statements for HK / mainland names: the parsers and the quarter arithmetic are the contract. */
import { describe, expect, it } from 'vitest'
import { aPeriods, deCumulate, fetchCnFinancials, hkPeriods, quarterEnds } from '../../src/lib/cnFinancials.js'

const row = (end, code, item, amount, name = '') => ({ REPORT_DATE: `${end} 00:00:00`, DATE_TYPE_CODE: code, STD_ITEM_CODE: item, STD_ITEM_NAME: name, AMOUNT: amount })

describe('hkPeriods + deCumulate', () => {
  it('maps the standardised items and turns cumulative periods into quarters', () => {
    const inc = [
      ...['2025-03-31:003:100', '2025-06-30:002:230', '2025-09-30:004:390', '2025-12-31:001:580'].map((s) => { const [e, c, v] = s.split(':'); return row(e, c, '004001001', Number(v)) }),
      ...['2025-03-31:003:10', '2025-06-30:002:25', '2025-09-30:004:45', '2025-12-31:001:70'].map((s) => { const [e, c, v] = s.split(':'); return row(e, c, '004025002', Number(v)) }),
      row('2025-12-31', '001', '004027003', 7.1), row('2025-12-31', '001', '004007999', 290),
    ]
    const cf = [row('2025-12-31', '001', '003999', 120)]
    const periods = hkPeriods(inc, cf)
    expect(periods.map((p) => [p.end, p.kind, p.revenue])).toEqual([['2025-03-31', 'Q1', 100], ['2025-06-30', 'H1', 230], ['2025-09-30', '9M', 390], ['2025-12-31', 'FY', 580]])
    expect(periods[3]).toMatchObject({ grossProfit: 290, eps: 7.1, opCashFlow: 120, fcf: null })
    const q = deCumulate(periods)
    expect(q.map((p) => [p.kind, p.revenue, p.netIncome])).toEqual([['Q1', 100, 10], ['Q2', 130, 15], ['Q3', 160, 20], ['Q4', 190, 25]])
  })

  it('keeps a period cumulative, and says so, when its predecessor is missing', () => {
    const q = deCumulate(hkPeriods([row('2025-06-30', '002', '004001001', 230), row('2025-12-31', '001', '004001001', 580)], []))
    expect(q.map((p) => [p.kind, p.revenue])).toEqual([['H1 (累计)', 230], ['FY (累计)', 580]])
  })
})

describe('aPeriods', () => {
  it('reads the wide rows into revenue / gross / net / eps / fcf', () => {
    const lrb = [{ REPORT_DATE: '2025-12-31 00:00:00', TOTAL_OPERATE_INCOME: 1000, OPERATE_COST: 600, PARENT_NETPROFIT: 150, DILUTED_EPS: 1.25 }]
    const xj = [{ REPORT_DATE: '2025-12-31 00:00:00', NETCASH_OPERATE: 220, CONSTRUCT_LONG_ASSET: 70 }]
    const zc = [{ REPORT_DATE: '2025-12-31 00:00:00', TOTAL_ASSETS: 9000, TOTAL_LIABILITIES: 4000, MONETARYFUNDS: 800 }]
    expect(aPeriods(lrb, zc, xj)[0]).toMatchObject({ end: '2025-12-31', revenue: 1000, grossProfit: 400, netIncome: 150, eps: 1.25, opCashFlow: 220, fcf: 150, totalAssets: 9000 })
  })
  it('leaves gross profit null for a bank with no operating cost line', () => {
    expect(aPeriods([{ REPORT_DATE: '2025-12-31', TOTAL_OPERATE_INCOME: 3000, PARENT_NETPROFIT: 1400 }], [], [])[0].grossProfit).toBeNull()
  })
})

describe('quarterEnds / fetchCnFinancials', () => {
  it('lists the last reported quarter-ends newest first', () => {
    expect(quarterEnds(4, new Date(Date.UTC(2026, 7, 22)))).toEqual(['2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30'])
  })
  it('walks company types until the mainland F10 answers, then remembers it', async () => {
    const calls = []
    const fetchImpl = async (url) => {
      calls.push(url)
      if (url.includes('/cn/f10') && url.includes('ct=3')) return { ok: true, json: async () => ({ data: [{ REPORT_DATE: '2025-12-31', TOTAL_OPERATE_INCOME: 10, PARENT_NETPROFIT: 2 }] }) }
      if (url.includes('/cn/f10')) return { ok: true, json: async () => ({ data: [] }) }
      return { ok: false, status: 404 }
    }
    const out = await fetchCnFinancials('600036.SS', { fetchImpl })
    expect(out.annual[0]).toMatchObject({ revenue: 10, netIncome: 2 })
    expect(calls.filter((u) => u.includes('stmt=lrb&ct=4')).length).toBeGreaterThan(0)
    await expect(fetchCnFinancials('AAPL', { fetchImpl })).rejects.toThrow()
  })
})
