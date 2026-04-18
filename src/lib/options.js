// Options chain fetcher via the Cloudflare Worker (Yahoo v7/finance/options).
// Degrades gracefully when no proxy_url is set — returns null, page shows a
// "set proxy URL" prompt.

// Short-TTL cache to avoid hammering the proxy when the user flips expiries.
const CACHE_TTL_MS = 30_000
const _cache = new Map()

function getProxyUrl() {
  return localStorage.getItem('proxy_url') || ''
}

export function isOptionsAvailable() {
  return !!getProxyUrl()
}

/**
 * Fetch options chain for a symbol. Optional `expiryTs` selects a specific
 * expiry (Unix seconds, as Yahoo returns in expirationDates).
 * Returns a normalized shape: { underlying, expirations, calls, puts, selectedExpiry }.
 * On any failure (no proxy, bad response, parsing error): returns null.
 */
export async function fetchOptionsChain(symbol, expiryTs = null) {
  const proxy = getProxyUrl()
  if (!proxy || !symbol) return null

  const cacheKey = `${symbol}:${expiryTs ?? 'default'}`
  const cached = _cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.data

  const qs = expiryTs ? `?date=${encodeURIComponent(expiryTs)}` : ''
  const url = `${proxy.replace(/\/$/, '')}/v7/finance/options/${encodeURIComponent(symbol)}${qs}`

  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!resp.ok) return null
    const json = await resp.json()
    const parsed = parseOptionsResponse(json)
    if (parsed) _cache.set(cacheKey, { data: parsed, ts: Date.now() })
    return parsed
  } catch {
    return null
  }
}

export function parseOptionsResponse(json) {
  const result = json?.optionChain?.result?.[0]
  if (!result) return null

  const optionsArr = Array.isArray(result.options) ? result.options : []
  const chain = optionsArr[0] || {}
  const quote = result.quote || {}
  const underlyingPrice = quote.regularMarketPrice ?? null

  const enrichContract = (c, type) => ({
    contractSymbol: c.contractSymbol,
    strike: c.strike,
    bid: c.bid ?? null,
    ask: c.ask ?? null,
    lastPrice: c.lastPrice ?? null,
    volume: c.volume ?? 0,
    openInterest: c.openInterest ?? 0,
    impliedVolatility: c.impliedVolatility ?? null,
    inTheMoney: c.inTheMoney ?? null,
    change: c.change ?? null,
    percentChange: c.percentChange ?? null,
    moneyness: underlyingPrice != null ? moneyness(c.strike, underlyingPrice, type) : null,
  })

  return {
    underlying: {
      symbol: result.underlyingSymbol,
      price: underlyingPrice,
      name: quote.shortName || quote.longName || null,
    },
    expirations: Array.isArray(result.expirationDates) ? result.expirationDates.slice() : [],
    strikes: Array.isArray(result.strikes) ? result.strikes.slice() : [],
    selectedExpiry: chain.expirationDate ?? null,
    calls: (chain.calls || []).map(c => enrichContract(c, 'call')),
    puts: (chain.puts || []).map(c => enrichContract(c, 'put')),
  }
}

/**
 * Signed moneyness as a percent: (strike - price) / price * 100.
 * Calls are ITM when strike < price (negative moneyness).
 * Puts are ITM when strike > price (positive moneyness).
 * We return the raw signed value — callers can flip per type if needed.
 */
export function moneyness(strike, price, _type = null) {
  if (!price || strike == null) return null
  return ((strike - price) / price) * 100
}

/** Find the strike index closest to the underlying price. */
export function atmIndex(contracts, price) {
  if (!contracts?.length || price == null) return -1
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < contracts.length; i++) {
    const d = Math.abs((contracts[i].strike ?? Infinity) - price)
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }
  return bestIdx
}

export function _clearCacheForTests() {
  _cache.clear()
}
