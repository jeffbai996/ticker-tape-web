const CAPABILITY_KEY = 'watchlist_sync_cap_v1'
// One sync code covers every synced document (watchlists AND portfolios) —
// engines subscribe here so enable/connect/disconnect restarts them all.
const capabilityListeners = new Set()

export function onCapabilityChange(fn) {
  capabilityListeners.add(fn)
  return () => capabilityListeners.delete(fn)
}

function fireCapabilityChange() {
  for (const fn of [...capabilityListeners]) fn()
}
const CAPABILITY_RE = /^[a-f0-9]{32}$/
const DEFAULT_WORKER = 'https://yf-proxy.2phakhvpgh.workers.dev'

export function validWatchlistCapability(value) {
  return CAPABILITY_RE.test(String(value || '').trim().toLowerCase())
}

export function createWatchlistCapability(cryptoImpl = globalThis.crypto) {
  const bytes = new Uint8Array(16)
  cryptoImpl.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

// The family build carries its own store (owner decision, Jeff 2026-08-21:
// zero-setup persistence beats keeping the bearer out of a public bundle for
// a family-grade book — tradeoff explicitly accepted, twice). The value
// arrives from CI as a secret and rides codex's hardened transport: bearer
// header only, never a URL, Durable-Object-coordinated writes.
const FIXED_CAP = String(import.meta.env.VITE_SYNC_CAPABILITY || '').trim().toLowerCase()

export function fixedSyncCapability() {
  return validWatchlistCapability(FIXED_CAP) ? FIXED_CAP : ''
}

export function getWatchlistCapability() {
  try {
    const value = localStorage.getItem(CAPABILITY_KEY) || ''
    if (validWatchlistCapability(value)) return value.toLowerCase()
  } catch { /* fall through to the build's own store */ }
  return fixedSyncCapability()
}

export function saveWatchlistCapability(value) {
  const clean = String(value || '').trim().toLowerCase()
  if (!validWatchlistCapability(clean)) return ''
  try { localStorage.setItem(CAPABILITY_KEY, clean) } catch { return '' }
  fireCapabilityChange()
  return clean
}

export function clearWatchlistCapability() {
  try { localStorage.removeItem(CAPABILITY_KEY) } catch { /* local-only remains usable */ }
  fireCapabilityChange()
}

export function watchlistSyncEndpoint(capability = getWatchlistCapability(), base) {
  if (!validWatchlistCapability(capability)) return ''
  let root = base
  if (!root) {
    root = import.meta.env.VITE_DATA_PROXY
      || (() => {
        try { return localStorage.getItem('proxy_url') } catch { return '' }
      })()
      || DEFAULT_WORKER
  }
  return `${String(root).replace(/\/$/, '')}/watchlists`
}

/** Capabilities authorize the request but never enter the URL (and therefore
 * access logs, browser history, or error telemetry). */
export function watchlistSyncHeaders(capability = getWatchlistCapability()) {
  if (!validWatchlistCapability(capability)) return {}
  return { Authorization: `Bearer ${capability}` }
}
