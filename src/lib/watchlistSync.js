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

export function getWatchlistCapability() {
  try {
    const value = localStorage.getItem(CAPABILITY_KEY) || ''
    return validWatchlistCapability(value) ? value.toLowerCase() : ''
  } catch {
    return ''
  }
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
  return `${String(root).replace(/\/$/, '')}/watchlists/${capability}`
}
