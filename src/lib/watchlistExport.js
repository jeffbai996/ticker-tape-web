import { getCached, subscribe } from './feed.js'
import { getWatchlist, onWatchlistChange } from './watchlist.js'
import { wireServiceUrl } from './wire.js'

function instrumentEntries(symbols, quoteLookup = getCached) {
  return symbols.map((symbol) => ({
    symbol,
    instrument_type: quoteLookup(symbol)?.quote?.quoteType || '',
  }))
}

/** Export one list. Primary-list sync uses replace; named-list export remains
 * additive so a one-off research basket cannot erase the main wire book. */
export async function pushWatchlistToWire(endpoint, symbols, fetcher = fetch,
  { replace = false, quoteLookup = getCached } = {}) {
  const entries = instrumentEntries(symbols, quoteLookup)
  const response = await fetcher(`${endpoint.replace(/\/$/, '')}/api/watchlist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(replace ? { replace: entries } : { add: entries }),
  })
  const out = await response.json()
  if (!out.ok) throw new Error(out.error || 'watchlist export failed')
  return out
}

let started = false
let timer = null
let retry = null
let lastSignature = ''
let pendingSignature = ''

function signature(symbols) {
  return JSON.stringify(instrumentEntries(symbols))
}

/** Keep Fragwire's book aligned with tt-web's primary watchlist. Quote updates
 * trigger one follow-up when provider instrument types become available. */
export function startWireWatchlistSync() {
  if (started || typeof localStorage === 'undefined') return
  const endpoint = wireServiceUrl()
  if (!endpoint) return
  started = true

  const sync = async () => {
    const symbols = getWatchlist()
    const nextSignature = signature(symbols)
    pendingSignature = ''
    if (nextSignature === lastSignature) return
    try {
      await pushWatchlistToWire(endpoint, symbols, fetch, { replace: true })
      lastSignature = nextSignature
      clearTimeout(retry)
    } catch {
      clearTimeout(retry)
      retry = setTimeout(sync, 30_000)
    }
  }
  const queue = () => {
    const nextSignature = signature(getWatchlist())
    if (nextSignature === lastSignature || nextSignature === pendingSignature) return
    pendingSignature = nextSignature
    clearTimeout(timer)
    timer = setTimeout(sync, 1500)
  }

  onWatchlistChange(queue)
  subscribe((symbol) => {
    if (getWatchlist().includes(symbol)) queue()
  })
  queue()
}
