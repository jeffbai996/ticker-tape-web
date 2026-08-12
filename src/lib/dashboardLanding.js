// The dashboard's landing list is a device preference, not watchlist data.
// Keeping it out of cloud sync lets two browsers open different household
// boards even though both browsers share the same synced list collection.

const KEY = 'dashboard_landing_v1'
const ID_RE = /^[a-z0-9-]{1,40}$/

export function rememberDashboardLanding(id, storage = localStorage) {
  const value = id == null ? 'main' : String(id).toLowerCase()
  if (value !== 'main' && !ID_RE.test(value)) return false
  try {
    storage.setItem(KEY, value)
    return true
  } catch { return false }
}

/** Return null for the main board or a currently-existing named-list id. */
export function resolveDashboardLanding(lists, storage = localStorage) {
  let value = null
  try { value = storage.getItem(KEY) } catch { return null }
  if (!value || value === 'main') return null
  if (ID_RE.test(value) && (lists || []).some((item) => item.id === value)) return value
  try { storage.removeItem(KEY) } catch { /* best-effort cleanup */ }
  return null
}
