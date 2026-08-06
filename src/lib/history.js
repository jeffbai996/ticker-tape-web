// One-shot fetches for the Research view: OHLC history and news headlines.
// Light TTL cache so tab-flipping doesn't refetch.

import { proxyBase } from './feed.js'
import { quoteFromChart, barsFromChart } from './yahoo.js'
import { createPCache } from './pcache.js'

// `warm`: a longer fetch at the SAME interval, used only to spin indicators up
// before the window starts (see chartmath.warmedBars). MACD needs 34 prior
// bars, so every daily range asks for the next size up; MAX has nothing older.
export const RANGES = [
  { key: '1D', range: '1d', interval: '5m', intraday: true, ttl: 60_000, warm: '5d', ticks: ['1m', '2m', '5m', '15m'] },
  { key: '5D', range: '5d', interval: '15m', intraday: true, ttl: 5 * 60_000, warm: '1mo', ticks: ['5m', '15m', '30m', '1h'] },
  { key: '1M', range: '1mo', interval: '1d', ttl: 10 * 60_000, warm: '3mo' },
  { key: '3M', range: '3mo', interval: '1d', ttl: 10 * 60_000, warm: '6mo' },
  { key: '6M', range: '6mo', interval: '1d', ttl: 10 * 60_000, warm: '1y' },
  { key: 'YTD', range: 'ytd', interval: '1d', ttl: 10 * 60_000, warm: '2y' },
  { key: '1Y', range: '1y', interval: '1d', ttl: 10 * 60_000, warm: '2y' },
  { key: '2Y', range: '2y', interval: '1d', ttl: 30 * 60_000, warm: '5y' },
  { key: '5Y', range: '5y', interval: '1wk', ttl: 30 * 60_000, warm: '10y' },
  { key: 'MAX', range: 'max', interval: '1wk', ttl: 60 * 60_000 },
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

async function fetchChart(symbol, range, interval) {
  const url = `${proxyBase()}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`
  const resp = await fetch(url, { signal: AbortSignal.timeout(12_000) })
  if (!resp.ok) throw new Error(`history ${symbol}: HTTP ${resp.status}`)
  const result = (await resp.json())?.chart?.result?.[0]
  if (!result) throw new Error(`history ${symbol}: empty`)
  return result
}

export function fetchHistory(symbol, rangeKey, { warm = false, interval = null } = {}) {
  const r = RANGES.find((x) => x.key === rangeKey) || RANGES[2]
  if (warm && !r.warm) return Promise.resolve({ bars: [] })
  const range = warm ? r.warm : r.range
  const iv = interval || r.interval
  return cached(`h:${symbol}:${r.key}${iv !== r.interval ? `:${iv}` : ''}${warm ? ':warm' : ''}`, r.ttl, async () => {
    const result = await fetchChart(symbol, range, iv)
    let bars = barsFromChart(result)
    // an empty intraday answer is a Yahoo hiccup, not a market holiday —
    // pull the wider window and keep only the newest session
    if (!bars.length && !warm && r.intraday && r.warm) {
      const wide = await fetchChart(symbol, r.warm, iv).catch(() => null)
      if (wide) bars = lastSessionBars(barsFromChart(wide))
      if (!bars.length) throw new Error(`history ${symbol}: no bars`)
    }
    return { quote: quoteFromChart(result), bars, intraday: !!r.intraday }
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
