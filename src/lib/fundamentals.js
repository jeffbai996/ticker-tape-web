// Fundamentals via Yahoo v10 quoteSummary. Unlike v8, this endpoint needs
// Yahoo's cookie+crumb dance, which the yf-proxy Worker handles server-side —
// a plain pass-through (like the dev server's /yf proxy) can't, because the
// browser won't replay .yahoo.com cookies against localhost. So this always
// goes through a crumb-capable base, even in dev.

import { createPCache } from './pcache.js'

const MODULES = 'summaryDetail,defaultKeyStatistics,financialData'
const TTL = 60 * 60_000

const FIELDS = {
  summaryDetail: ['trailingPE', 'dividendYield', 'dividendRate', 'exDividendDate', 'payoutRatio', 'beta', 'marketCap', 'fiftyTwoWeekLow', 'fiftyTwoWeekHigh', 'volume', 'averageVolume', 'open', 'previousClose'],
  defaultKeyStatistics: ['forwardPE', 'pegRatio', 'enterpriseToEbitda', 'shortPercentOfFloat', 'priceToBook', 'enterpriseValue', 'sharesOutstanding', 'floatShares'],
  financialData: [
    'grossMargins', 'operatingMargins', 'profitMargins', 'returnOnEquity',
    'debtToEquity', 'freeCashflow', 'targetMeanPrice', 'recommendationKey',
    'priceToSalesTrailing12Months', 'revenueGrowth', 'earningsGrowth',
  ],
}

export function flattenSummary(result) {
  const out = {}
  for (const [module, keys] of Object.entries(FIELDS)) {
    const m = result?.[module] || {}
    for (const k of keys) {
      const v = m[k]
      if (v == null) continue
      out[k] = typeof v === 'object' ? v.raw : v
    }
  }
  return out
}

function crumbBase() {
  if (import.meta.env.VITE_DATA_PROXY) return import.meta.env.VITE_DATA_PROXY
  const saved = localStorage.getItem('proxy_url')
  if (saved) return saved.replace(/\/$/, '')
  return 'https://yf-proxy.2phakhvpgh.workers.dev'
}

const cache = createPCache('fund_cache_v2', { max: 40 })
const calCache = createPCache('cal_cache_v1', { max: 60 })
const CAL_TTL = 6 * 60 * 60_000

/** Last-known values, synchronously and TTL-blind — research subviews seed
 *  their initial state from these so a tab flip paints the previous answer
 *  while the fetch below revalidates (2026-08-10). */
export function peekFundamentals(symbol) { return cache.peek(symbol)?.value }
export function peekEarningsDate(symbol) { return calCache.peek(symbol)?.value }

/** Next earnings date (epoch ms) + EPS estimate via v10 calendarEvents. */
export async function fetchEarningsDate(symbol) {
  const hit = calCache.get(symbol)
  if (hit && Date.now() - hit.ts < CAL_TTL) return hit.value

  const url = `${crumbBase()}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`calendar ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const e = data?.quoteSummary?.result?.[0]?.calendarEvents?.earnings
  const first = e?.earningsDate?.[0]?.raw
  const value = first
    ? { date: first * 1000, epsEstimate: e?.earningsAverage?.raw ?? null }
    : null
  calCache.set(symbol, { value, ts: Date.now() })
  return value
}

const insCache = createPCache('ins_cache_v1', { max: 30 })
const INS_TTL = 6 * 60 * 60_000

/** Recent insider transactions via v10 insiderTransactions. */
export async function fetchInsider(symbol) {
  const hit = insCache.get(symbol)
  if (hit && Date.now() - hit.ts < INS_TTL) return hit.value

  const url = `${crumbBase()}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=insiderTransactions`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`insider ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const txns = data?.quoteSummary?.result?.[0]?.insiderTransactions?.transactions
  if (!txns) throw new Error(`insider ${symbol}: empty`)

  const value = txns.slice(0, 25).map((t) => ({
    name: t.filerName,
    relation: t.filerRelation,
    text: t.transactionText,
    date: t.startDate?.raw ? t.startDate.raw * 1000 : null,
    shares: t.shares?.raw ?? null,
    value: t.value?.raw ?? null,
  }))
  insCache.set(symbol, { value, ts: Date.now() })
  return value
}

/** Pure: pull recommendation trend, price targets, and rating changes. */
export function parseAnalysts(result) {
  const raw = (v) => (v != null && typeof v === 'object' ? v.raw : v)
  const trend = (result?.recommendationTrend?.trend || []).find((t) => t.period === '0m') || null
  const fd = result?.financialData || {}
  const history = (result?.upgradeDowngradeHistory?.history || [])
    .slice(0, 20)
    .map((h) => ({
      date: h.epochGradeDate ? h.epochGradeDate * 1000 : null,
      firm: h.firm,
      to: h.toGrade,
      from: h.fromGrade,
      action: h.action,
      pt: h.currentPriceTarget ?? null,
      priorPt: h.priorPriceTarget ?? null,
    }))
  return {
    trend: trend
      ? { strongBuy: trend.strongBuy, buy: trend.buy, hold: trend.hold, sell: trend.sell, strongSell: trend.strongSell }
      : null,
    targets: {
      low: raw(fd.targetLowPrice) ?? null,
      mean: raw(fd.targetMeanPrice) ?? null,
      high: raw(fd.targetHighPrice) ?? null,
      analysts: raw(fd.numberOfAnalystOpinions) ?? null,
    },
    history,
  }
}

const anaCache = createPCache('ana_cache_v1', { max: 30 })
const ANA_TTL = 6 * 60 * 60_000

export async function fetchAnalysts(symbol) {
  const hit = anaCache.get(symbol)
  if (hit && Date.now() - hit.ts < ANA_TTL) return hit.value

  const url = `${crumbBase()}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=upgradeDowngradeHistory,recommendationTrend,financialData`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`analysts ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const result = data?.quoteSummary?.result?.[0]
  if (!result) throw new Error(`analysts ${symbol}: empty`)
  const value = parseAnalysts(result)
  anaCache.set(symbol, { value, ts: Date.now() })
  return value
}

export async function fetchFundamentals(symbol) {
  const hit = cache.get(symbol)
  if (hit && Date.now() - hit.ts < TTL) return hit.value

  const url = `${crumbBase()}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${MODULES}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`fundamentals ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const result = data?.quoteSummary?.result?.[0]
  if (!result) throw new Error(`fundamentals ${symbol}: empty`)

  const value = flattenSummary(result)
  cache.set(symbol, { value, ts: Date.now() })
  return value
}

/** Pure: company profile from assetProfile. */
export function parseProfile(result) {
  const p = result?.assetProfile
  if (!p) return null
  return {
    sector: p.sector ?? null,
    industry: p.industry ?? null,
    employees: p.fullTimeEmployees ?? null,
    address: p.address1 ?? null,
    city: p.city ?? null,
    state: p.state ?? null,
    zip: p.zip ?? null,
    country: p.country ?? null,
    phone: p.phone ?? null,
    website: p.website ?? null,
    irWebsite: p.irWebsite ?? null,
    summary: p.longBusinessSummary ?? null,
    officers: (p.companyOfficers || [])
      .filter((o) => o?.name)
      .slice(0, 8)
      .map((o) => ({ name: o.name, title: o.title ?? '',
                     pay: o.totalPay?.raw ?? null })),
  }
}

const profCache = createPCache('prof_cache_v1', { max: 30 })
const PROF_TTL = 7 * 24 * 60 * 60_000

export function peekProfile(symbol) { return profCache.peek(symbol)?.value }

export async function fetchProfile(symbol) {
  const hit = profCache.get(symbol)
  if (hit && Date.now() - hit.ts < PROF_TTL) return hit.value
  const url = `${crumbBase()}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=assetProfile`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`profile ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const value = parseProfile(data?.quoteSummary?.result?.[0])
  profCache.set(symbol, { value, ts: Date.now() })
  return value
}

/** Pure: ownership breakdown + top institutional holders. */
export function parseHolders(result) {
  const raw = (v) => (v != null && typeof v === 'object' ? v.raw : v)
  const b = result?.majorHoldersBreakdown
  const rows = (result?.institutionOwnership?.ownershipList || [])
    .filter((o) => o?.organization)
    .slice(0, 15)
    .map((o) => ({
      org: o.organization,
      pctHeld: raw(o.pctHeld) ?? null,
      position: raw(o.position) ?? null,
      value: raw(o.value) ?? null,
      reportDate: raw(o.reportDate) != null ? raw(o.reportDate) * 1000 : null,
    }))
  if (!b && !rows.length) return null
  return {
    insidersPct: raw(b?.insidersPercentHeld) ?? null,
    institutionsPct: raw(b?.institutionsPercentHeld) ?? null,
    institutionsCount: raw(b?.institutionsCount) ?? null,
    top: rows,
  }
}

const holdCache = createPCache('hold_cache_v1', { max: 30 })
const HOLD_TTL = 24 * 60 * 60_000

export async function fetchHolders(symbol) {
  const hit = holdCache.get(symbol)
  if (hit && Date.now() - hit.ts < HOLD_TTL) return hit.value
  const url = `${crumbBase()}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=majorHoldersBreakdown,institutionOwnership`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`holders ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const value = parseHolders(data?.quoteSummary?.result?.[0])
  holdCache.set(symbol, { value, ts: Date.now() })
  return value
}
