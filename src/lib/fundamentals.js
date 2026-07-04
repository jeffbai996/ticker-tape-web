// Fundamentals via Yahoo v10 quoteSummary. Unlike v8, this endpoint needs
// Yahoo's cookie+crumb dance, which the yf-proxy Worker handles server-side —
// a plain pass-through (like the dev server's /yf proxy) can't, because the
// browser won't replay .yahoo.com cookies against localhost. So this always
// goes through a crumb-capable base, even in dev.

import { createPCache } from './pcache.js'

const MODULES = 'summaryDetail,defaultKeyStatistics,financialData'
const TTL = 60 * 60_000

const FIELDS = {
  summaryDetail: ['trailingPE', 'dividendYield', 'beta', 'marketCap', 'fiftyTwoWeekLow', 'fiftyTwoWeekHigh'],
  defaultKeyStatistics: ['forwardPE', 'pegRatio', 'enterpriseToEbitda', 'shortPercentOfFloat', 'priceToBook', 'enterpriseValue'],
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

const cache = createPCache('fund_cache_v1', { max: 40 })
const calCache = createPCache('cal_cache_v1', { max: 60 })
const CAL_TTL = 6 * 60 * 60_000

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
