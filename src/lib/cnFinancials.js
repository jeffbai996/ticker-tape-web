/** Financial statements for Hong Kong / mainland listings, in the shape the
 *  research Financials table already eats: periods of
 *  {ts, end, revenue, grossProfit, netIncome, eps, fcf}.
 *
 *  HK: East Money's standardised statements (long format, one row per line
 *  item per period, cumulative within the fiscal year). Quarters are
 *  de-cumulated here — Q2 = H1 − Q1, Q3 = 9M − H1, Q4 = FY − 9M — which is
 *  arithmetic, not estimation, and is exported for tests. HK statements
 *  carry no capex line, so free cash flow is null rather than invented.
 *  Mainland: the F10 statement pages (wide format), single-quarter figures
 *  straight from the source (reportType=2) and annual from the 12-31 rows.
 */

import { proxyBase } from './feed.js'
import { isCnListing } from './cnData.js'

// HK standardised item codes (RPT_HKF10_FN_*_PC)
const HK = {
  revenue: ['004001001', '004001999'],          // 营业额, else 营运收入
  grossProfit: ['004007999'],                   // 毛利
  netIncome: ['004025002'],                     // 股东应占溢利
  eps: ['004027003', '004027002'],              // 每股摊薄盈利, else 基本
  opCashFlow: ['003999'],                       // 经营业务现金净额
}
const HK_KIND = { '001': 'FY', '002': 'H1', '003': 'Q1', '004': '9M' }

const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null))
const day = (v) => String(v || '').slice(0, 10)

/** Long-format rows → {end: {kind, field: value}} keyed by period end. */
export function hkPeriods(income, cashflow) {
  const out = new Map()
  const take = (rows) => {
    for (const r of rows || []) {
      const end = day(r.REPORT_DATE)
      if (!end) continue
      const p = out.get(end) || (out.set(end, { end, kind: HK_KIND[r.DATE_TYPE_CODE] || r.DATE_TYPE_CODE, items: {} }), out.get(end))
      if (r.STD_ITEM_CODE) p.items[r.STD_ITEM_CODE] = num(r.AMOUNT)
    }
  }
  take(income); take(cashflow)
  const pick = (items, codes) => { for (const c of codes) if (items[c] != null) return items[c]; return null }
  return [...out.values()].sort((a, b) => a.end.localeCompare(b.end)).map((p) => ({
    end: p.end, kind: p.kind, ts: Date.parse(p.end) / 1000,
    revenue: pick(p.items, HK.revenue), grossProfit: pick(p.items, HK.grossProfit),
    netIncome: pick(p.items, HK.netIncome), eps: pick(p.items, HK.eps),
    opCashFlow: pick(p.items, HK.opCashFlow), fcf: null,
  }))
}

const FLOW = ['revenue', 'grossProfit', 'netIncome', 'eps', 'opCashFlow']
const sub = (a, b) => (a == null || b == null ? null : a - b)

/** Cumulative fiscal-year periods → discrete quarters. A quarter whose
 *  predecessor is missing stays cumulative and says so via `kind`. */
export function deCumulate(periods) {
  const byYear = new Map()
  for (const p of periods) {
    const y = p.end.slice(0, 4)
    byYear.set(y, { ...(byYear.get(y) || {}), [p.kind]: p })
  }
  const out = []
  for (const p of periods) {
    const y = byYear.get(p.end.slice(0, 4))
    const prev = p.kind === 'H1' ? y.Q1 : p.kind === '9M' ? y.H1 : p.kind === 'FY' ? y['9M'] : null
    if (p.kind === 'Q1') { out.push({ ...p, kind: 'Q1' }); continue }
    if (!prev) { out.push({ ...p, kind: `${p.kind} (累计)` }); continue }
    const q = { ...p, kind: p.kind === 'H1' ? 'Q2' : p.kind === '9M' ? 'Q3' : 'Q4' }
    for (const f of FLOW) q[f] = sub(p[f], prev[f])
    out.push(q)
  }
  return out
}

/** Mainland wide rows (one per period) → periods. */
export function aPeriods(lrb, zcfzb, xjllb) {
  const byEnd = new Map()
  const at = (end) => byEnd.get(end) || (byEnd.set(end, { end, ts: Date.parse(end) / 1000 }), byEnd.get(end))
  for (const r of lrb || []) {
    const p = at(day(r.REPORT_DATE))
    p.revenue = num(r.TOTAL_OPERATE_INCOME) ?? num(r.OPERATE_INCOME)
    const cost = num(r.OPERATE_COST)
    p.grossProfit = p.revenue != null && cost != null ? p.revenue - cost : null
    p.netIncome = num(r.PARENT_NETPROFIT) ?? num(r.NETPROFIT)
    p.eps = num(r.DILUTED_EPS) ?? num(r.BASIC_EPS)
  }
  for (const r of xjllb || []) {
    const p = at(day(r.REPORT_DATE))
    p.opCashFlow = num(r.NETCASH_OPERATE)
    const capex = num(r.CONSTRUCT_LONG_ASSET)
    p.fcf = p.opCashFlow != null && capex != null ? p.opCashFlow - capex : null
  }
  for (const r of zcfzb || []) {
    const p = at(day(r.REPORT_DATE))
    p.totalAssets = num(r.TOTAL_ASSETS); p.totalLiabilities = num(r.TOTAL_LIABILITIES); p.cash = num(r.MONETARYFUNDS)
  }
  return [...byEnd.values()].filter((p) => p.end).sort((a, b) => a.end.localeCompare(b.end))
}

/** The last n quarter-end dates, newest first, as 'YYYY-MM-DD'. */
export function quarterEnds(n = 8, now = new Date()) {
  const out = []
  let y = now.getUTCFullYear()
  let q = Math.floor(now.getUTCMonth() / 3)          // 0..3 current quarter (not yet reported)
  for (let i = 0; i < n; i++) {
    q -= 1
    if (q < 0) { q = 3; y -= 1 }
    out.push(`${y}-${['03-31', '06-30', '09-30', '12-31'][q]}`)
  }
  return out
}

async function getJson(path, { fetchImpl = fetch, signal } = {}) {
  const resp = await fetchImpl(`${proxyBase()}${path}`, { signal: signal ?? AbortSignal.timeout(15_000) })
  if (!resp.ok) throw new Error(`statements: HTTP ${resp.status}`)
  return resp.json()
}

const ctHit = new Map()            // symbol -> companyType that answered

async function f10(sym, stmt, rt, dates, opts) {
  const tryCt = async (ct) => {
    const d = await getJson(`/cn/f10?symbol=${encodeURIComponent(sym)}&stmt=${stmt}&ct=${ct}&rt=${rt}&dates=${dates.join(',')}`, opts)
    return Array.isArray(d?.data) ? d.data : []
  }
  const known = ctHit.get(sym)
  if (known) return tryCt(known)
  for (const ct of [4, 3, 2, 1]) {
    const rows = await tryCt(ct).catch(() => [])
    if (rows.length) { ctHit.set(sym, ct); return rows }
  }
  return []
}

/** {quarterly, annual} for a HK / mainland symbol, newest last like the Yahoo path. */
export async function fetchCnFinancials(symbol, opts = {}) {
  const sym = String(symbol).toUpperCase()
  if (!isCnListing(sym)) throw new Error('not a HK / mainland listing')
  if (sym.endsWith('.HK')) {
    const [inc, cf] = await Promise.all([
      getJson(`/cn/report?symbol=${sym}&report=hk_income&n=1500`, opts).then((d) => d?.result?.data || []),
      getJson(`/cn/report?symbol=${sym}&report=hk_cashflow&n=1500`, opts).then((d) => d?.result?.data || []).catch(() => []),
    ])
    const periods = hkPeriods(inc, cf)
    const annual = periods.filter((p) => p.kind === 'FY').slice(-5)
    const quarterly = deCumulate(periods).filter((p) => p.kind !== 'FY').slice(-6)
    return { quarterly, annual, cumulative: false }
  }
  const dates = quarterEnds(8)
  const annualDates = dates.filter((d) => d.endsWith('12-31')).concat(quarterEnds(20).filter((d) => d.endsWith('12-31'))).filter((d, i, a) => a.indexOf(d) === i).slice(0, 5)
  const [lrbQ, xjQ, lrbA, xjA, zcA] = await Promise.all([
    f10(sym, 'lrb', 2, dates, opts), f10(sym, 'xjllb', 2, dates, opts).catch(() => []),
    f10(sym, 'lrb', 1, annualDates, opts), f10(sym, 'xjllb', 1, annualDates, opts).catch(() => []),
    f10(sym, 'zcfzb', 1, annualDates, opts).catch(() => []),
  ])
  return { quarterly: aPeriods(lrbQ, [], xjQ).slice(-6), annual: aPeriods(lrbA, zcA, xjA).slice(-5), cumulative: false }
}
