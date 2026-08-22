// The sync capability comes from the BUILD (the family build's fixed
// store) or from nowhere. The browser-entered "sync code" path was retired
// 2026-08-22: the worker accepts exactly one token, so a visitor-typed code
// could only ever 401 — a control that promised something impossible.
const CAPABILITY_RE = /^[a-f0-9]{32}$/
const DEFAULT_WORKER = 'https://yf-proxy.2phakhvpgh.workers.dev'

export function validWatchlistCapability(value) {
  return CAPABILITY_RE.test(String(value || '').trim().toLowerCase())
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
  return fixedSyncCapability()
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
