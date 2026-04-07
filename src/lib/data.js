// Data fetching layer with TTL cache.
// All data comes from pre-built JSON files in /data/ (populated by GitHub Actions).

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

// Convenience loaders
export const loadQuotes     = () => fetchData('quotes.json')
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

// Invalidate specific cache entry
export function invalidate(path) {
  cache.delete(path)
}
