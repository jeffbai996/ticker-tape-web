// Data fetching layer with TTL cache.
// Static data from pre-built JSON files in /data/ (populated by GitHub Actions).
// Live quotes merged transparently from CF Worker when available.

import { getLiveQuotes } from './live.js'

const cache = new Map()
const TTL = 30_000 // 30 seconds

const BASE = import.meta.env.BASE_URL

export async function fetchData(path) {
  const cached = cache.get(path)
  if (cached && Date.now() - cached.ts < TTL) return cached.data

  try {
    const res = await fetch(`${BASE}data/${path}?t=${Date.now()}`)
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const data = await res.json()
    cache.set(path, { data, ts: Date.now() })
    return data
  } catch (err) {
    // Return stale cache on failure
    if (cached) return cached.data
    console.error(`Failed to fetch ${path}:`, err)
    return null
  }
}

// Quotes: merge live data on top of static pipeline data.
// Any page calling loadQuotes() automatically gets live prices when available.
export async function loadQuotes() {
  const staticQ = await fetchData('quotes.json')
  const liveMap = getLiveQuotes()
  if (!liveMap?.size) return staticQ
  if (!staticQ) return Array.from(liveMap.values())
  return staticQ.map(sq => liveMap.get(sq.symbol) || sq)
}

export const loadMeta       = () => fetchData('meta.json')
export const loadMarket     = () => fetchData('market.json')
export const loadTechnicals = () => fetchData('technicals.json')
export const loadSparklines = () => fetchData('sparklines.json')
export const loadEarnings   = () => fetchData('earnings.json')
export const loadSectors    = () => fetchData('sectors.json')
export const loadNews       = () => fetchData('news.json')
export const loadCommodities = () => fetchData('commodities.json')
export const loadEcon       = () => fetchData('econ.json')
export const loadCorrelation = () => fetchData('correlation.json')

export const loadChart  = (sym) => fetchData(`charts/${sym}.json`)
export const loadLookup = (sym) => fetchData(`lookup/${sym}.json`)
export const loadImpact = (sym) => fetchData(`impact/${sym}.json`)

// Invalidate specific cache entry
export function invalidate(path) {
  cache.delete(path)
}
