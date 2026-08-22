/** Corporate actions: the parsers are the contract; money per share must be exact. */
import { describe, expect, it } from 'vitest'
import { fetchSymbolEvents, nextOnOrAfter, parseADividends, parseAResults, parseHkDividends, parseHkPlan, parseYahooCalendar } from '../../src/lib/cnEvents.js'

describe('A-share reports', () => {
  it('turns 10派10.03元 into 1.003 per share with the dates and yield', () => {
    const out = parseADividends({ result: { data: [
      { EX_DIVIDEND_DATE: '2026-07-10 00:00:00', EQUITY_RECORD_DATE: '2026-07-09 00:00:00', PRETAX_BONUS_RMB: 10.03, IMPL_PLAN_PROFILE: '10派10.03元(含税)', DIVIDENT_RATIO: 0.026711, REPORT_DATE: '2025-12-31 00:00:00' },
      { EX_DIVIDEND_DATE: '2025-07-11 00:00:00', PRETAX_BONUS_RMB: 9.72, REPORT_DATE: '2024-12-31 00:00:00' },
    ] } })
    expect(out[0]).toMatchObject({ exDate: '2026-07-10', recordDate: '2026-07-09', perShare: 1.003, yieldPct: 2.67, period: '2025-12-31', ccy: 'CNY' })
    expect(out[1].perShare).toBeCloseTo(0.972)
  })

  it('reads the results schedule and sorts newest period first', () => {
    const out = parseAResults({ result: { data: [
      { REPORT_DATE: '2026-03-31 00:00:00', APPOINT_PUBLISH_DATE: '2026-04-29 00:00:00', ACTUAL_PUBLISH_DATE: '2026-04-29 00:00:00' },
      { REPORT_DATE: '2026-06-30 00:00:00', APPOINT_PUBLISH_DATE: '2026-08-29 00:00:00', ACTUAL_PUBLISH_DATE: null },
    ] } })
    expect(out.map((r) => [r.period, r.appointed, r.actual])).toEqual([['2026-06-30', '2026-08-29', null], ['2026-03-31', '2026-04-29', '2026-04-29']])
  })
})

describe('Hong Kong dividends', () => {
  it('parses the plan text in dollars and cents', () => {
    expect(parseHkPlan('每股派港币5.3元')).toBe(5.3)
    expect(parseHkPlan('每股派5.3港仙')).toBeCloseTo(0.053)
    expect(parseHkPlan('每股派美元0.12元')).toBe(0.12)
    expect(parseHkPlan('不派息')).toBeNull()
  })
  it('maps the report rows with the listing currency', () => {
    const out = parseHkDividends({ result: { data: [{ EX_DIVIDEND_DATE: '2026-05-15 00:00:00', RECORD_DATE: '2026-05-20 00:00:00', DIVIDEND_DATE: '2026-06-01', PLAN_EXPLAIN: '每股派港币5.3元', ASSIGN_PERIOD: '2025末期', IS_DIVIDEND: '1' }] } })
    expect(out[0]).toMatchObject({ exDate: '2026-05-15', recordDate: '2026-05-20', payDate: '2026-06-01', perShare: 5.3, ccy: 'HKD', period: '2025末期' })
  })
})

describe('Yahoo calendar', () => {
  it('lifts earnings dates and the ex-dividend date', () => {
    const c = parseYahooCalendar({ quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ fmt: '2026-10-29' }, { raw: 1761696000 }] }, exDividendDate: { fmt: '2026-08-10' }, dividendDate: { fmt: '2026-08-13' } } }] } })
    expect(c.earnings[0]).toBe('2026-10-29'); expect(c.earnings).toHaveLength(2)
    expect(c.exDate).toBe('2026-08-10'); expect(c.payDate).toBe('2026-08-13')
    expect(nextOnOrAfter(['2026-01-01', '2026-10-29', '2026-07-01'], '2026-08-22')).toBe('2026-10-29')
    expect(nextOnOrAfter([], '2026-08-22')).toBeNull()
  })
})

describe('fetchSymbolEvents', () => {
  const ok = (body) => ({ ok: true, json: async () => body })
  it('routes a mainland name to the two reports and a US name to Yahoo, each failing alone', async () => {
    const calls = []
    const fetchImpl = async (url) => {
      calls.push(url)
      if (url.includes('a_results')) return ok({ result: { data: [{ REPORT_DATE: '2026-06-30', APPOINT_PUBLISH_DATE: '2026-08-29', ACTUAL_PUBLISH_DATE: null }] } })
      if (url.includes('a_dividends')) return { ok: false, status: 502 }
      if (url.includes('calendarEvents')) return ok({ quoteSummary: { result: [{ calendarEvents: { earnings: { earningsDate: [{ fmt: '2026-10-29' }] }, exDividendDate: { fmt: '2026-08-10' } } }] } })
      return { ok: false, status: 404 }
    }
    const a = await fetchSymbolEvents('600036.SS', { fetchImpl, today: '2026-08-22' })
    expect(a).toMatchObject({ nextResults: '2026-08-29', resultsPeriod: '2026-06-30', dividends: [] })
    const u = await fetchSymbolEvents('AAPL', { fetchImpl, today: '2026-08-22', dividendsImpl: async () => [{ date: Date.UTC(2026, 7, 10), amount: 0.26 }, { date: Date.UTC(2026, 4, 12), amount: 0.25 }] })
    expect(u).toMatchObject({ nextResults: '2026-10-29', exDate: '2026-08-10' })
    expect(u.dividends[0]).toMatchObject({ exDate: '2026-08-10', perShare: 0.26, ccy: 'USD' })
    expect(calls.some((c) => c.includes('/cn/report') && c.includes('AAPL'))).toBe(false)
  })
})
