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

/** Watchlist-bucket mates, for peer reaction context. */
export function peersOf(symbol) {
  const sym = (symbol || '').toUpperCase()
  const bucket = BUCKETS.find((b) => b.symbols.includes(sym))
  return bucket ? bucket.symbols.filter((s) => s !== sym) : []
}

/** Full earnings impact: quarters + report dates + own/peer price reactions. */
export async function fetchEarningsImpact(symbol) {
  const [quarters, dates] = await Promise.all([
    fetchEarningsHistory(symbol),
    fetchReportDates(symbol).catch(() => []), // calendar index is patchy — degrade to surprise-only
  ])
  if (!quarters.length) return { events: [], summary: earningsSummary([]) }

  // Daily bars are only needed for quarters we can pin to a report date.
  const anyDated = quarters.some((q) => matchReportDate(q.quarter, dates))
  const bars = anyDated
    ? await fetchHistory(symbol, '2Y').then((h) => h.bars).catch(() => [])
    : []
  const peers = anyDated ? peersOf(symbol).slice(0, 5) : []
  const peerBars = {}
  await Promise.all(
    peers.map((p) =>
      fetchHistory(p, '2Y').then((h) => { peerBars[p] = h.bars }).catch(() => {}),
    ),
  )

  const events = quarters.map((q) => {
    const report = matchReportDate(q.quarter, dates)
    return {
      ...q,
      report,
      priceMove: report ? reactionAfter(bars, report) : null,
      peers: report
        ? peers
            .map((p) => ({ sym: p, move: reactionAfter(peerBars[p] || [], report) }))
            .filter((x) => x.move != null)
        : [],
    }
  })
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

const rdCache = createPCache('erd_cache_v1', { max: 30 })
const RD_TTL = 24 * 60 * 60_000

/** Historical report datetimes (epoch ms, may be incomplete) via the earnings calendar. */
export async function fetchReportDates(symbol) {
  const hit = rdCache.get(symbol)
  if (hit && Date.now() - hit.ts < RD_TTL) return hit.value

  const body = JSON.stringify({
    sortType: 'DESC',
    entityIdType: 'earnings',
    sortField: 'startdatetime',
    includeFields: ['ticker', 'startdatetime', 'epsactual'],
    query: { operator: 'and', operands: [{ operator: 'eq', operands: ['ticker', symbol.toUpperCase()] }] },
    offset: 0,
    size: 20,
  })
  const resp = await fetch(`${crumbBase()}/v1/finance/visualization?lang=en-US&region=US`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal: AbortSignal.timeout(12_000),
  })
  if (!resp.ok) throw new Error(`report dates ${symbol}: HTTP ${resp.status}`)
  const data = await resp.json()
  const doc = data?.finance?.result?.[0]?.documents?.[0]
  const cols = (doc?.columns || []).map((c) => c.id)
  const di = cols.indexOf('startdatetime')
  const value = di < 0 ? [] : (doc.rows || [])
    .map((r) => Date.parse(r[di]))
    .filter((t) => Number.isFinite(t))
  rdCache.set(symbol, { value, ts: Date.now() })
  return value
}
