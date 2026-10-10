// Pure view helpers for the TV board: row shape from a feed cache entry,
// sparkline geometry, sort modes, chart range stepping, session wording and
// wire headline selection. Rendering stays in the components.

import { effectiveEventTime, sortWireLatest, srcCred } from '../../src/lib/wire.js'

const SPARK_DAYS = 22 // about one trading month of the feed's daily bars

const direction = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat')

export function rowView(entry) {
  const q = entry?.quote
  if (!q) return { ready: false, dir: 'flat', ext: null, spark: [] }
  // histo is badges.histoBars output: compact { v, up, c, h, l } bars
  const closes = (entry.histo || []).map((b) => b?.c).filter((v) => v != null)
  return {
    ready: true,
    name: q.name || '',
    price: q.price,
    change: q.change,
    pct: q.pct,
    dir: direction(q.change),
    ext: q.extPrice != null
      ? { label: q.extLabel, price: q.extPrice, pct: q.extPct, dir: direction(q.extPct) }
      : null,
    spark: closes.slice(-SPARK_DAYS),
  }
}

export function sparkPath(values, width, height) {
  if (!values || values.length < 2) return ''
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo
  const step = width / (values.length - 1)
  return values.map((v, i) => {
    const y = span === 0 ? height / 2 : height - ((v - lo) / span) * height
    return `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${y.toFixed(1)}`
  }).join('')
}

const SORTS = ['list', 'gainers', 'losers']

export function nextSort(mode) {
  return SORTS[(SORTS.indexOf(mode) + 1) % SORTS.length]
}

export function sortSymbols(symbols, quoteOf, mode) {
  if (mode === 'list') return [...symbols]
  const sign = mode === 'gainers' ? -1 : 1
  const pctOf = (s) => quoteOf(s)?.pct
  return [...symbols].sort((a, b) => {
    const pa = pctOf(a)
    const pb = pctOf(b)
    if (pa == null && pb == null) return 0
    if (pa == null) return 1
    if (pb == null) return -1
    return sign * (pa - pb)
  })
}

// Keys from src/lib/history.js RANGES, chosen so Left/Right covers intraday
// through five years in six presses.
export const TV_RANGES = ['2D', '5D', '1M', '6M', '1Y', '5Y']

export function stepRange(key, delta) {
  const i = TV_RANGES.indexOf(key)
  if (i < 0) return '1M'
  return TV_RANGES[Math.max(0, Math.min(TV_RANGES.length - 1, i + delta))]
}

const SESSION_WORDS = {
  pre: 'Pre-market', open: 'Market open', post: 'After hours', closed: 'Market closed',
}

export function sessionLabel({ state, holiday }) {
  if (holiday) return `Closed for ${holiday}`
  return SESSION_WORDS[state] || SESSION_WORDS.closed
}

/** Newest distinct headlines from wire-credible sources. Each carries `at`,
 *  the wire's effective time: some feeds stamp stories hours in the future,
 *  and those fall back to when the wire first saw them. */
export function pickHeadlines(events, now, limit) {
  const seen = new Set()
  const credible = (events || [])
    .filter((ev) => ev?.type === 'headline' && ev.headline && srcCred(ev) >= 1)
  return sortWireLatest(credible, now)
    .filter((ev) => {
      const key = ev.headline.trim().toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, limit)
    .map((ev) => ({ ...ev, at: effectiveEventTime(ev, now) }))
}

export function ageLabel(ts, now) {
  const s = Math.max(0, now - ts)
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}
