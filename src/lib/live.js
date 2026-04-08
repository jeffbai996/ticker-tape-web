// Live quote polling via Cloudflare Worker (Yahoo Finance CORS proxy).
// Polls v7/finance/quote endpoint at configurable interval.
// Worker URL read from localStorage 'proxy_url' (set in Settings).

let _liveQuotes = new Map()
let _lastFetchTs = 0
let _pollTimer = null
let _pollSymbols = []
let _listeners = []

function getWorkerUrl() {
  return localStorage.getItem('proxy_url') || ''
}

// ── Public API ───────────────────────────────

/** Whether a Worker URL is configured */
export function isLiveAvailable() {
  return !!getWorkerUrl()
}

/** Current live quote cache (Map<symbol, quote>) */
export function getLiveQuotes() {
  return _liveQuotes
}

/** Milliseconds since last successful fetch */
export function getDataAge() {
  return _lastFetchTs ? Date.now() - _lastFetchTs : Infinity
}

/** Freshness category for UI indicators */
export function getStaleness() {
  if (!isLiveAvailable()) return 'none'
  const age = getDataAge()
  if (age < 30_000) return 'live'
  if (age < 300_000) return 'delayed'
  return 'stale'
}

/** Subscribe to live quote updates. Returns unsubscribe function. */
export function onLiveUpdate(fn) {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(f => f !== fn) }
}

/** Start polling loop. Merges symbols with any previously registered. */
export function startPolling(symbols, intervalMs = 15_000) {
  const newSyms = symbols.filter(s => !_pollSymbols.includes(s))
  _pollSymbols = [...new Set([..._pollSymbols, ...symbols])]

  // Don't start if no Worker URL configured
  if (!isLiveAvailable()) return

  // If timer already running, just fetch the expanded set immediately
  if (_pollTimer) {
    if (newSyms.length) fetchLiveQuotes(_pollSymbols)
    return
  }

  fetchLiveQuotes(_pollSymbols)
  _pollTimer = setInterval(() => fetchLiveQuotes(_pollSymbols), intervalMs)
}

/** Stop the polling loop */
export function stopPolling() {
  if (_pollTimer) {
    clearInterval(_pollTimer)
    _pollTimer = null
  }
}

/** Add symbols to the polling set. Auto-starts polling if Worker available. */
export function addSymbols(newSyms) {
  const added = newSyms.filter(s => !_pollSymbols.includes(s))
  if (!added.length) return
  _pollSymbols.push(...added)
  if (isLiveAvailable()) {
    if (!_pollTimer) startPolling(_pollSymbols)
    else fetchLiveQuotes(_pollSymbols)
  }
}

/** Re-initialize polling (e.g. after settings change) */
export function reinitPolling() {
  stopPolling()
  if (_pollSymbols.length && isLiveAvailable()) {
    startPolling(_pollSymbols)
  }
}

// ── Internal ─────────────────────────────────

/** Transform Yahoo v7 quote response to our quotes.json format */
function transformQuote(yq) {
  const state = (yq.marketState || '').toUpperCase()
  const isPost = state === 'POST' || state === 'POSTPOST'
  const isPre = state === 'PRE' || state === 'PREPRE'

  let ext_price = null, ext_change = null, ext_pct = null, ext_label = null
  if (isPost && yq.postMarketPrice) {
    ext_price = yq.postMarketPrice
    ext_change = yq.postMarketChange
    ext_pct = yq.postMarketChangePercent
    ext_label = 'AH'
  } else if (isPre && yq.preMarketPrice) {
    ext_price = yq.preMarketPrice
    ext_change = yq.preMarketChange
    ext_pct = yq.preMarketChangePercent
    ext_label = 'PM'
  }

  return {
    symbol: yq.symbol,
    name: yq.shortName || yq.longName || '',
    price: yq.regularMarketPrice ?? 0,
    change: yq.regularMarketChange ?? 0,
    pct: yq.regularMarketChangePercent ?? 0,
    ext_price,
    ext_change,
    ext_pct,
    ext_label,
    _marketState: state.toLowerCase(),
    _live: true,
  }
}

/** Fetch live quotes from CF Worker */
async function fetchLiveQuotes(symbols) {
  const url = getWorkerUrl()
  if (!url || !symbols.length) return null

  try {
    const symbolStr = symbols.join(',')
    const resp = await fetch(`${url}/v7/finance/quote?symbols=${encodeURIComponent(symbolStr)}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!resp.ok) throw new Error(`Worker returned ${resp.status}`)
    const data = await resp.json()
    const results = data?.quoteResponse?.result || []

    const transformed = []
    for (const yq of results) {
      const q = transformQuote(yq)
      _liveQuotes.set(q.symbol, q)
      transformed.push(q)
    }
    _lastFetchTs = Date.now()

    // Notify all listeners
    for (const fn of _listeners) {
      try { fn(transformed) } catch (e) { console.warn('Live update listener error:', e) }
    }

    return transformed
  } catch (err) {
    console.warn('Live quote fetch failed:', err.message)
    return null
  }
}
