/** Corporate actions for a hand-built book — results dates and dividends.
 *
 *  Mainland names: East Money datacenter reports through the worker's
 *  /cn/report route (Yahoo has no A-share results calendar). Hong Kong:
 *  the HK dividend report for amounts, Yahoo's calendarEvents for the
 *  next results date. US / everything else: Yahoo calendarEvents plus the
 *  chart's dividend events. Parsers are pure; fetchers take a fetchImpl.
 */

import { proxyBase } from './feed.js'
import { isCnListing } from './cnData.js'
import { fetchDividends } from './history.js'

const day = (v) => (v ? String(v).slice(0, 10) : null)
const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null))

/** RPT_SHAREBONUS_DET rows → [{exDate, recordDate, perShare, plan, yieldPct, period}] newest first.
 *  PRETAX_BONUS_RMB is per TEN shares ("10派10.03元"). */
export function parseADividends(data) {
  const rows = data?.result?.data || []
  return rows.filter((r) => r?.EX_DIVIDEND_DATE || r?.PLAN_NOTICE_DATE).map((r) => ({
    exDate: day(r.EX_DIVIDEND_DATE), recordDate: day(r.EQUITY_RECORD_DATE), payDate: null,
    perShare: num(r.PRETAX_BONUS_RMB) != null ? Math.round((num(r.PRETAX_BONUS_RMB) / 10) * 1e6) / 1e6 : null,
    plan: r.IMPL_PLAN_PROFILE || '', yieldPct: num(r.DIVIDENT_RATIO) != null ? Math.round(num(r.DIVIDENT_RATIO) * 1e4) / 100 : null,
    period: day(r.REPORT_DATE), ccy: 'CNY',
  })).sort((a, b) => String(b.exDate || '').localeCompare(String(a.exDate || '')))
}

/** RPT_PUBLIC_BS_APPOIN rows → [{period, appointed, actual}] newest period first. */
export function parseAResults(data) {
  const rows = data?.result?.data || []
  return rows.map((r) => ({
    period: day(r.REPORT_DATE), appointed: day(r.APPOINT_PUBLISH_DATE || r.FIRST_APPOINT_DATE), actual: day(r.ACTUAL_PUBLISH_DATE),
  })).filter((r) => r.period).sort((a, b) => b.period.localeCompare(a.period))
}

/** "每股派港币5.3元" / "每股派美元0.12元" / "每股派5.3港仙" → amount in the listing's own currency. */
export function parseHkPlan(text) {
  const s = String(text || '')
  const m = /每股派(?:发)?(?:港币|港元|美元|人民币|HK\$|\$)?\s*([\d.]+)\s*(港仙|仙|元|港元|美元|人民币)?/.exec(s)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  return /仙/.test(m[2] || '') ? n / 100 : n
}

/** RPT_HKF10_INFO_DIVIDEND rows → same shape as parseADividends. */
export function parseHkDividends(data) {
  const rows = data?.result?.data || []
  return rows.filter((r) => r?.IS_DIVIDEND !== '0').map((r) => ({
    exDate: day(r.EX_DIVIDEND_DATE), recordDate: day(r.RECORD_DATE), payDate: day(r.DIVIDEND_DATE),
    perShare: parseHkPlan(r.PLAN_EXPLAIN), plan: r.PLAN_EXPLAIN || '', yieldPct: null, period: r.ASSIGN_PERIOD || '',
    ccy: /美元/.test(r.PLAN_EXPLAIN || '') ? 'USD' : /人民币/.test(r.PLAN_EXPLAIN || '') ? 'CNY' : 'HKD',
  })).sort((a, b) => String(b.exDate || '').localeCompare(String(a.exDate || '')))
}

/** Yahoo calendarEvents → {earnings: ['YYYY-MM-DD'…], exDate, payDate}. */
export function parseYahooCalendar(data) {
  const c = data?.quoteSummary?.result?.[0]?.calendarEvents || {}
  const dates = (c.earnings?.earningsDate || []).map((d) => d?.fmt || (d?.raw ? new Date(d.raw * 1000).toISOString().slice(0, 10) : null)).filter(Boolean)
  return { earnings: dates, exDate: c.exDividendDate?.fmt || null, payDate: c.dividendDate?.fmt || null }
}

/** The first date on or after `today` from a list, or null. */
export function nextOnOrAfter(dates, today) {
  return (dates || []).filter((d) => d && d >= today).sort()[0] || null
}

async function getJson(path, { fetchImpl = fetch, signal } = {}) {
  const resp = await fetchImpl(`${proxyBase()}${path}`, { signal: signal ?? AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`events: HTTP ${resp.status}`)
  return resp.json()
}

const report = (symbol, name, n, opts) => getJson(`/cn/report?symbol=${encodeURIComponent(symbol)}&report=${name}&n=${n}`, opts)

/** Everything the page shows for one holding, in one object. Each source
 *  fails independently — a missing dividend report is a dash, not an error. */
export async function fetchSymbolEvents(symbol, { today = new Date().toISOString().slice(0, 10), dividendsImpl = fetchDividends, ...opts } = {}) {
  const sym = String(symbol).toUpperCase()
  const out = { symbol: sym, nextResults: null, resultsPeriod: null, exDate: null, payDate: null, dividends: [], yieldPct: null }
  const cn = isCnListing(sym)
  const mainland = cn && !sym.endsWith('.HK')
  const tasks = []
  if (mainland) {
    tasks.push(report(sym, 'a_results', 6, opts).then((d) => {
      const rows = parseAResults(d)
      const upcoming = rows.filter((r) => !r.actual && r.appointed && r.appointed >= today).sort((a, b) => a.appointed.localeCompare(b.appointed))[0]
      if (upcoming) { out.nextResults = upcoming.appointed; out.resultsPeriod = upcoming.period }
    }).catch(() => {}))
    tasks.push(report(sym, 'a_dividends', 6, opts).then((d) => { out.dividends = parseADividends(d) }).catch(() => {}))
  } else {
    tasks.push(getJson(`/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=calendarEvents`, opts).then((d) => {
      const c = parseYahooCalendar(d)
      out.nextResults = nextOnOrAfter(c.earnings, today)
      out.exDate = c.exDate; out.payDate = c.payDate
    }).catch(() => {}))
    if (cn) tasks.push(report(sym, 'hk_dividends', 6, opts).then((d) => { out.dividends = parseHkDividends(d) }).catch(() => {}))
    else {
      // the chart's dividend events: amount per share in the listing's currency
      tasks.push(Promise.resolve().then(() => dividendsImpl(sym)).then((rows) => {
        out.dividends = (rows || []).filter((r) => r?.amount != null).map((r) => ({
          exDate: r.date ? new Date(r.date).toISOString().slice(0, 10) : null, recordDate: null, payDate: null,
          perShare: r.amount, plan: '', yieldPct: null, period: '', ccy: opts.ccy || 'USD',
        })).sort((a, b) => String(b.exDate || '').localeCompare(String(a.exDate || '')))
      }).catch(() => {}))
    }
  }
  await Promise.all(tasks)
  const latest = out.dividends[0]
  if (latest) {
    if (!out.exDate || (latest.exDate && latest.exDate > out.exDate)) out.exDate = latest.exDate || out.exDate
    out.payDate = out.payDate || latest.payDate || null
    out.yieldPct = latest.yieldPct ?? null
  }
  return out
}
