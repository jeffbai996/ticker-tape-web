// Earnings surprise history + price reaction ("earnings impact").
//
// Two Yahoo sources merged: v10 earningsHistory is reliable and current but
// only knows fiscal quarter-ends; the visualization API (earnings calendar)
// has actual report datetimes but its index is patchy — for some symbols it
// lags a year. So quarters come from earningsHistory, and a price reaction is
// computed only for quarters we can match to a real report date. No date, no
// move — never guessed from price gaps.

import { createPCache } from './pcache.js'
import { fetchHistory } from './history.js'
import { BUCKETS } from './symbols.js'

const DAY = 86_400_000
const REPORT_WINDOW_DAYS = 75

export function parseEarningsHistory(result) {
  const history = result?.earningsHistory?.history || []
  return history
    .filter((h) => h?.epsActual?.raw != null)
    .map((h) => ({
      quarter: (h.quarter?.raw ?? 0) * 1000,
      epsEstimate: h.epsEstimate?.raw ?? null,
      epsActual: h.epsActual.raw,
      surprisePct: h.surprisePercent?.raw ?? null, // fraction, not percent
    }))
    .sort((a, b) => b.quarter - a.quarter)
}

/** Earliest report date falling in (quarterEnd, quarterEnd + window], or null. */
export function matchReportDate(quarterEndMs, reportDatesMs) {
  const candidates = (reportDatesMs || []).filter(
    (d) => d > quarterEndMs && d <= quarterEndMs + REPORT_WINDOW_DAYS * DAY,
  )
  return candidates.length ? Math.min(...candidates) : null
}

/** % move from the close on/before the report date to the first close after (by UTC calendar day). */
export function reactionAfter(bars, reportMs) {
  if (!bars?.length) return null
  const reportDay = Math.floor(reportMs / DAY)
  let before = null
  let after = null
  for (const b of bars) {
    const barDay = Math.floor((b.time * 1000) / DAY)
    if (barDay <= reportDay) before = b
    else if (before && !after) {
      after = b
      break
    }
  }
  if (!before || !after || !before.close) return null
  return ((after.close - before.close) / before.close) * 100
}

/** Beat streak counts from the newest event until the first non-beat. */
export function earningsSummary(events) {
  const surprises = events.filter((e) => e.surprisePct != null).map((e) => e.surprisePct)
  const moves = events.filter((e) => e.priceMove != null).map((e) => e.priceMove)
  let beatStreak = 0
  for (const e of events) {
    if (e.surprisePct != null && e.surprisePct > 0) beatStreak++
    else break
  }
  const beats = surprises.filter((s) => s > 0).length
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  return {
    total: surprises.length,
    beats,
    beatRate: surprises.length ? beats / surprises.length : null,
    beatStreak,
    avgSurprise: avg(surprises),
    avgMove: avg(moves),
  }
}

/** Calendar rows (report datetime + eps columns) → normalized quarters.
 * The calendar's surprise column is a percent; v10's is a fraction — this
 * normalizes to fraction so downstream math has one unit. */
export function parseCalendarRows(data) {
  const doc = data?.finance?.result?.[0]?.documents?.[0]
  const cols = (doc?.columns || []).map((c) => c.id)
  const di = cols.indexOf('startdatetime')
  const ai = cols.indexOf('epsactual')
  const ei = cols.indexOf('epsestimate')
  const si = cols.indexOf('epssurprisepct')
  if (di < 0) return []
  return (doc?.rows || [])
    .map((r) => ({
      report: Date.parse(r[di]),
      epsActual: ai >= 0 && r[ai] != null ? Number(r[ai]) : null,
      epsEstimate: ei >= 0 && r[ei] != null ? Number(r[ei]) : null,
      surprisePct: si >= 0 && r[si] != null ? Number(r[si]) / 100 : null,
    }))
    .filter((x) => Number.isFinite(x.report))
    .sort((a, b) => b.report - a.report)
}

/** v10 quarters (4 newest, authoritative) + calendar prints going back years.
 * A calendar report inside a v10 quarter's report window is the same print —
 * skipped. Older prints extend the table with quarter=null (the calendar
 * knows report dates, not fiscal quarter-ends — no guessed dates). */
export function mergeQuarters(v10, calRows) {
  const extras = calRows.filter((c) =>
    c.epsActual != null
    && !v10.some((q) => c.report > q.quarter
      && c.report <= q.quarter + REPORT_WINDOW_DAYS * DAY))
  const orderKey = (e) => e.report ?? (e.quarter + 45 * DAY)
  return [
    ...v10,
    ...extras.map((c) => ({ quarter: null, report: c.report,
      epsEstimate: c.epsEstimate, epsActual: c.epsActual,
      surprisePct: c.surprisePct })),
  ].sort((a, b) => orderKey(b) - orderKey(a))
}

/** Watchlist-bucket mates, for peer reaction context. */
export function peersOf(symbol) {
  const sym = (symbol || '').toUpperCase()
  const bucket = BUCKETS.find((b) => b.symbols.includes(sym))
  return bucket ? bucket.symbols.filter((s) => s !== sym) : []
}

/** Full earnings impact: several years of quarters (v10 recent + calendar
 * history) + report dates + own/peer price reactions. */
export async function fetchEarningsImpact(symbol) {
  const [quarters, calRows] = await Promise.all([
    fetchEarningsHistory(symbol),
    fetchEarningsCalendar(symbol).catch(() => []), // patchy — degrade to 4q
  ])
  if (!quarters.length && !calRows.length) {
    return { events: [], summary: earningsSummary([]) }
  }
  const dates = calRows.map((c) => c.report)

  // Daily bars are only needed when at least one quarter pins to a date.
  const anyDated = calRows.length > 0
  const bars = anyDated
    ? await fetchHistory(symbol, '5Y').then((h) => h.bars).catch(() => [])
    : []
  const peers = anyDated ? peersOf(symbol).slice(0, 5) : []
  const peerBars = {}
  await Promise.all(
    peers.map((p) =>
      fetchHistory(p, '5Y').then((h) => { peerBars[p] = h.bars }).catch(() => {}),
    ),
  )

  const dated = quarters.map((q) => ({
    ...q,
    report: matchReportDate(q.quarter, dates),
  }))
  const events = mergeQuarters(dated, calRows).map((q) => ({
    ...q,
    priceMove: q.report ? reactionAfter(bars, q.report) : null,
    peers: q.report
      ? peers
          .map((p) => ({ sym: p, move: reactionAfter(peerBars[p] || [], q.report) }))
          .filter((x) => x.move != null)
      : [],
  }))
  return { events, summary: earningsSummary(events) }
}

function crumbBase() {
  if (import.meta.env.VITE_DATA_PROXY) return import.meta.env.VITE_DATA_PROXY
  const saved = localStorage.getItem('proxy_url')
  if (saved) return saved.replace(/\/$/, '')
  return 'https://yf-proxy.2phakhvpgh.workers.dev'
}

const ehCache = createPCache('eh_cache_v1', { max: 30 })
const EH_TTL = 6 * 60 * 60_000

/** Past reported quarters, newest first. */
export async function fetchEarningsHistory(symbol) {
  const hit = ehCache.get(symbol)
  if (hit && Date.now() - hit.ts < EH_TTL) return hit.value

  const url = `${crumbBase()}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=earningsHistory`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`earnings ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const value = parseEarningsHistory(data?.quoteSummary?.result?.[0])
  ehCache.set(symbol, { value, ts: Date.now() })
  return value
}

const rdCache = createPCache('erd_cache_v2', { max: 30 })
const RD_TTL = 24 * 60 * 60_000

/** Historical earnings prints via the calendar: report datetimes + eps
 * actual/estimate/surprise, ~10 years at size 40 (index may be incomplete). */
export async function fetchEarningsCalendar(symbol) {
  const hit = rdCache.get(symbol)
  if (hit && Date.now() - hit.ts < RD_TTL) return hit.value

  const body = JSON.stringify({
    sortType: 'DESC',
    entityIdType: 'earnings',
    sortField: 'startdatetime',
    includeFields: ['ticker', 'startdatetime', 'epsactual', 'epsestimate',
                    'epssurprisepct'],
    query: { operator: 'and', operands: [{ operator: 'eq', operands: ['ticker', symbol.toUpperCase()] }] },
    offset: 0,
    size: 40,
  })
  const resp = await fetch(`${crumbBase()}/v1/finance/visualization?lang=en-US&region=US`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(12_000),
  })
  if (!resp.ok) throw new Error(`earnings calendar ${symbol}: HTTP ${resp.status}`)
  const value = parseCalendarRows(await resp.json())
  rdCache.set(symbol, { value, ts: Date.now() })
  return value
}

/**
 * Fiscal quarter-end months a company actually uses, learned from the
 * quarters we do have. NVDA ends Jan/Apr/Jul/Oct; TSLA ends Mar/Jun/Sep/Dec —
 * snapping everything to calendar quarters would mislabel half the tape.
 */
export function fiscalMonths(events) {
  const months = new Set()
  for (const e of events || []) {
    if (e.quarter != null) months.add(new Date(e.quarter).getUTCMonth())
  }
  return [...months].sort((a, b) => a - b)
}

/**
 * The fiscal quarter a report covers: the most recent quarter-end at least
 * `minLagDays` before the print. Returns null when we've learned no pattern.
 */
export function quarterForReport(reportMs, months, minLagDays = 10) {
  if (!reportMs || !months?.length) return null
  const cutoff = new Date(reportMs - minLagDays * 86_400_000)
  let best = null
  for (let back = 0; back < 6; back++) {
    const probe = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() - back + 1, 0))
    if (!months.includes(probe.getUTCMonth())) continue
    if (probe.getTime() <= cutoff.getTime()) { best = probe.getTime(); break }
  }
  return best
}

/** Median days between a quarter ending and the company reporting it. */
export function medianReportLag(events) {
  const lags = (events || [])
    .filter((e) => e.quarter != null && e.report != null)
    .map((e) => (e.report - e.quarter) / 86_400_000)
    .filter((d) => d > 0 && d < 120)
    .sort((a, b) => a - b)
  if (!lags.length) return null
  return Math.round(lags[Math.floor(lags.length / 2)])
}

/**
 * Fill the gaps the two upstream sources leave: v10 gives recent quarters
 * with no report date, the calendar gives report dates with no quarter.
 * Anything inferred is flagged so the UI can mark it rather than pass it off
 * as reported fact.
 */
export function reconcileQuarters(events) {
  const months = fiscalMonths(events)
  // Quarters first: the two sources are disjoint (v10 has quarters with no
  // report date, the calendar has report dates with no quarter), so nothing
  // has both until this pass — and without a complete row there's no lag to
  // learn. Infer quarters, then measure the lag off those, then backfill the
  // missing report dates.
  const withQuarters = (events || []).map((e) => {
    if (e.quarter != null || e.report == null) return e
    const q = quarterForReport(e.report, months)
    return q ? { ...e, quarter: q, quarterInferred: true } : e
  })
  const lag = medianReportLag(withQuarters)
  return withQuarters.map((e) => (
    e.report == null && e.quarter != null && lag != null
      ? { ...e, report: e.quarter + lag * 86_400_000, reportInferred: true }
      : e
  ))
}
