// Financial statements off Yahoo's fundamentals-timeseries API — the modern
// pipe. The old v10 statement modules come back gutted (grossProfit 0,
// operatingIncome null), while timeseries serves five clean quarters of
// revenue/GP/NI/FCF/EPS through the same worker proxy.

import { proxyBase } from './feed.js'
import { createPCache } from './pcache.js'

const TTL = 6 * 3600_000
const cache = createPCache('fa_cache_v1', { max: 40 })

async function cached(key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttl) return hit.value
  const value = await fn()
  cache.set(key, { value, ts: Date.now() })
  return value
}

// timeseries type → row field
const TYPE_FIELD = {
  TotalRevenue: 'revenue',
  GrossProfit: 'grossProfit',
  NetIncome: 'netIncome',
  FreeCashFlow: 'fcf',
  DilutedEPS: 'eps',
}

/** Join typed series into per-period rows, ascending by timestamp. */
export function mergeTimeseries(results, cadence) {
  const byTs = new Map()
  for (const series of results || []) {
    const type = series?.meta?.type?.[0] || ''
    const field = TYPE_FIELD[type.replace(cadence, '')]
    if (!field) continue
    const stamps = series.timestamp || []
    const points = series[type] || []
    stamps.forEach((ts, i) => {
      const pt = points[i]
      if (pt?.reportedValue?.raw == null) return
      const row = byTs.get(ts) || { ts }
      row[field] = pt.reportedValue.raw
      if (pt.asOfDate && !row.end) row.end = pt.asOfDate
      byTs.set(ts, row)
    })
  }
  return [...byTs.values()].sort((a, b) => a.ts - b.ts)
}

const ROW_DEFS = [
  { key: 'revenue', label: 'Revenue', kind: 'money', growth: true },
  { key: 'grossMargin', label: 'Gross margin', kind: 'pct', from: (p) => p.grossProfit != null && p.revenue ? (p.grossProfit / p.revenue) * 100 : null },
  { key: 'netIncome', label: 'Net income', kind: 'money', growth: true },
  { key: 'netMargin', label: 'Net margin', kind: 'pct', from: (p) => p.netIncome != null && p.revenue ? (p.netIncome / p.revenue) * 100 : null },
  { key: 'eps', label: 'EPS (dil)', kind: 'eps', growth: true },
  { key: 'fcf', label: 'Free cash flow', kind: 'money', growth: true },
]

/** The matching period a year earlier, by report end-date (fiscal quarters
 *  drift, so "same quarter last year" is a ±45 day window on the calendar). */
function yearBack(periods, i) {
  const end = Date.parse(periods[i].end || '')
  if (Number.isNaN(end)) return null
  const target = end - 365 * 86400_000
  let best = null
  for (let j = 0; j < i; j += 1) {
    const t = Date.parse(periods[j].end || '')
    if (Number.isNaN(t)) continue
    if (best === null || Math.abs(t - target) < Math.abs(Date.parse(periods[best].end) - target)) best = j
  }
  if (best === null) return null
  return Math.abs(Date.parse(periods[best].end) - target) < 45 * 86400_000 ? best : null
}

/** Render-ready rows: {key, label, kind, cells: [{v, growth}]}. Rows with no
 *  data at all are dropped rather than printed as a line of dashes. */
export function statementRows(periods) {
  return ROW_DEFS.map((def) => {
    const values = periods.map((p) => (def.from ? def.from(p) : p[def.key] ?? null))
    if (!values.some((v) => v != null)) return null
    const cells = values.map((v, i) => {
      let growth = null
      if (def.growth && v != null) {
        const j = yearBack(periods, i)
        const base = j != null ? values[j] : null
        if (base) growth = ((v - base) / Math.abs(base)) * 100
      }
      return { v, growth }
    })
    return { key: def.key, label: def.label, kind: def.kind, cells }
  }).filter(Boolean)
}

async function fetchSeries(symbol, cadence) {
  const types = Object.keys(TYPE_FIELD).map((t) => `${cadence}${t}`).join(',')
  const period1 = Math.floor(Date.now() / 1000) - 5.2 * 365 * 86400
  const url = `${proxyBase()}/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`
    + `?type=${types}&period1=${period1}&period2=${Math.floor(Date.now() / 1000)}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`financials ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  return mergeTimeseries(data?.timeseries?.result, cadence)
}

export function fetchFinancials(symbol) {
  return cached(`fa:${symbol}`, TTL, async () => {
    const [quarterly, annual] = await Promise.all([
      fetchSeries(symbol, 'quarterly'),
      fetchSeries(symbol, 'annual'),
    ])
    return { quarterly: quarterly.slice(-6), annual: annual.slice(-5) }
  })
}
