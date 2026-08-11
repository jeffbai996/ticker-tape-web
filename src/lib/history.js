// One-shot fetches for the Research view: OHLC history and news headlines.
// Light TTL cache so tab-flipping doesn't refetch.

import { proxyBase, track } from './feed.js'
import { quoteFromChart, barsFromChart } from './yahoo.js'
import { createPCache } from './pcache.js'

// `warm`: a longer fetch at the SAME interval, used only to spin indicators up
// before the window starts (see chartmath.warmedBars). MACD needs 34 prior
// bars, so every daily range asks for the next size up; MAX has nothing older.
// `ticks`: selectable bar intervals for that window. Yahoo rejects anything
// outside [1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 4h, 1d, 5d, 1wk, 1mo, 3mo] —
// there is no sub-minute data, so 15s/30s cannot be offered. It also enforces
// a lookback per interval, and every pair below was checked against the live
// endpoint rather than inferred: 1m dies past ~7 days (1mo@1m is a 422), which
// is why 5D starts at 2m — its warm window is 1mo and would fail at 1m.
export const RANGES = [
  { key: '1D', range: '1d', interval: '5m', intraday: true, ttl: 60_000, warm: '5d', ticks: ['1m', '2m', '5m', '15m', '30m', '1h'] },
  { key: '5D', range: '5d', interval: '15m', intraday: true, ttl: 5 * 60_000, warm: '1mo', ticks: ['2m', '5m', '15m', '30m', '1h'] },
  { key: '1M', range: '1mo', interval: '1d', ttl: 10 * 60_000, warm: '3mo', ticks: ['30m', '1h', '4h', '1d'] },
  { key: '3M', range: '3mo', interval: '1d', ttl: 10 * 60_000, warm: '6mo', ticks: ['1h', '4h', '1d'] },
  { key: '6M', range: '6mo', interval: '1d', ttl: 10 * 60_000, warm: '1y', ticks: ['1h', '4h', '1d', '1wk'] },
  { key: 'YTD', range: 'ytd', interval: '1d', ttl: 10 * 60_000, warm: '2y', ticks: ['1h', '4h', '1d', '1wk'] },
  { key: '1Y', range: '1y', interval: '1d', ttl: 10 * 60_000, warm: '2y', ticks: ['1h', '4h', '1d', '1wk'] },
  { key: '2Y', range: '2y', interval: '1d', ttl: 30 * 60_000, warm: '5y', ticks: ['1d', '1wk', '1mo'] },
  { key: '5Y', range: '5y', interval: '1wk', ttl: 30 * 60_000, warm: '10y', ticks: ['1d', '1wk', '1mo'] },
  { key: 'MAX', range: 'max', interval: '1wk', ttl: 60 * 60_000, ticks: ['1wk', '1mo', '3mo'] },
]

const NEWS_TTL = 10 * 60_000

// Persisted across refreshes: history bars are the heavy fetches, so serving
// them from the last snapshot within TTL makes navigation/refresh instant.
const cache = createPCache('hist_cache_v1', { max: 48 })

async function cached(key, ttl, fn) {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < ttl) return hit.value
  const value = await fn()
  cache.set(key, { value, ts: Date.now() })
  return value
}

/** Bars that belong to the newest session present in an intraday set —
 *  Yahoo's 1d window intermittently answers with a quote and ZERO bars
 *  while 5d still carries today's prints (2026-08-06, blank 1D chart). */
export function lastSessionBars(bars) {
  if (!bars?.length) return []
  const day = (t) => new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const last = day(bars[bars.length - 1].time)
  return bars.filter((b) => day(b.time) === last)
}

async function fetchChart(symbol, range, interval, prepost = false) {
  // includePrePost widens an intraday window to 04:00–20:00 ET; daily and
  // weekly bars are unaffected by it (Jeff 2026-08-07, IBKR parity)
  const url = `${proxyBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`
    + (prepost ? '&includePrePost=true' : '')
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`history ${symbol}: HTTP ${resp.status}`)
  const result = (await resp.json())?.chart?.result?.[0]
  if (!result) throw new Error(`history ${symbol}: empty`)
  return result
}

// One place that decides what a request resolves to, so the fetch and the
// synchronous peek below can never key the same series differently.
function target(symbol, rangeKey, { warm = false, interval = null, prepost = false } = {}) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[2]
  const iv = interval || r.interval
  // the extended session is a DIFFERENT series, so it gets its own cache key
  const ext = prepost && r.intraday
  const key = `h:${symbol}:${r.key}${iv !== r.interval ? `:${iv}` : ''}${ext ? ':ext' : ''}${warm ? ':warm' : ''}`
  return { r, iv, ext, key }
}

/** Last-known bars for a range, synchronously and TTL-blind. Research subviews
 *  seed their state from this instead of null, so a tab flip paints the
 *  previous answer while fetchHistory revalidates (2026-08-10). */
export function peekHistory(symbol, rangeKey, opts = {}) {
  return cache.peek(target(symbol, rangeKey, opts).key)?.value
}

export function fetchHistory(symbol, rangeKey, opts = {}) {
  const { warm = false } = opts
  const { r, iv, ext, key } = target(symbol, rangeKey, opts)
  if (warm && !r.warm) return Promise.resolve({ bars: [] })
  const range = warm ? r.warm : r.range
  return cached(key, r.ttl, async () => {
    const result = await fetchChart(symbol, range, iv, ext)
    let bars = barsFromChart(result)
    // an empty intraday answer is a Yahoo hiccup, not a market holiday —
    // pull the wider window and keep only the newest session
    if (!bars.length && !warm && r.intraday && r.warm) {
      const wide = await fetchChart(symbol, r.warm, iv, ext).catch(() => null)
      if (wide) bars = lastSessionBars(barsFromChart(wide))
      if (!bars.length) throw new Error(`history ${symbol}: no bars`)
    }
    // a sub-daily tick on a daily range still needs the intraday time axis
    const subDaily = /[mh]$/.test(iv) && iv !== '1mo'
    return { quote: quoteFromChart(result), bars, intraday: !!r.intraday || subDaily }
  })
}

/** Dividend payouts, newest first, via v8 chart events (no crumb needed). */
export function fetchSplits(symbol) {
  return cached(`sp:${symbol}`, NEWS_TTL * 24, async () => {
    const url = `${proxyBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=10y&interval=3mo&events=split`
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!resp.ok) throw new Error(`splits ${symbol}: HTTP ${resp.status}`)
    const data = await resp.json()
    const ev = data?.chart?.result?.[0]?.events?.splits || {}
    return Object.values(ev)
      .map((s) => ({ date: s.date, ratio: `${s.numerator}:${s.denominator}` }))
      .sort((a, b) => b.date - a.date)
  })
}

/** Warm a symbol's quote + chart caches on hover intent, so the click lands on
 *  a painted page instead of a spinner. Both calls dedupe against their own
 *  caches, so no debounce is needed and a re-hover costs nothing; failures are
 *  silent because this is speculative work nobody asked for (2026-08-10). */
export function prefetchSymbol(symbol) {
  if (!symbol) return
  try {
    track([symbol])
  } catch {
    // feed unavailable (SSR/tests): the real fetch on navigation still runs
  }
  fetchHistory(symbol, '6M').catch(() => {})
}

export function fetchDividends(symbol) {
  return cached(`d:${symbol}`, 6 * 60 * 60_000, async () => {
    const url = `${proxyBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1mo&events=div`
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!resp.ok) throw new Error(`dividends ${symbol}: HTTP ${resp.status}`)
    const data = await resp.json()
    const divs = data?.chart?.result?.[0]?.events?.dividends || {}
    return Object.values(divs)
      .filter((d) => d?.amount != null && d?.date != null)
      .map((d) => ({ date: d.date, amount: d.amount }))
      .sort((a, b) => b.date - a.date)
  })
}

export function fetchNews(symbol) {
  return cached(`n:${symbol}`, NEWS_TTL, async () => {
    const url = `${proxyBase()}/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=8&quotesCount=0`
    const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
    if (!resp.ok) throw new Error(`news ${symbol}: HTTP ${resp.status}`)
    const data = await resp.json()
    // Keep time as epoch ms — Date objects don't survive the JSON persist.
    return (data?.news || []).map((n) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      time: n.providerPublishTime ? n.providerPublishTime * 1000 : null,
    }))
  })
}
