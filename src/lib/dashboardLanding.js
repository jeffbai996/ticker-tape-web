// The dashboard's landing list is a device preference, not watchlist data.
// Keeping it out of cloud sync lets two browsers open different household
// boards even though both browsers share the same synced list collection.

const KEY = 'dashboard_landing_v1'
const PIN_KEY = 'dashboard_landing_pin_v1'
const ID_RE = /^[a-z0-9-]{1,40}$/

export function rememberDashboardLanding(id, storage = localStorage) {
  const value = id == null ? 'main' : String(id).toLowerCase()
  if (value !== 'main' && !ID_RE.test(value)) return false
  try {
    storage.setItem(KEY, value)
    return true
  } catch { return false }
}

/** An explicit default (Jeff 2026-08-20): a pinned list beats the implicit
 *  last-viewed board. `null`/'main' pins the main board; passing undefined
 *  clears the pin. */
export function pinDashboardLanding(id, storage = localStorage) {
  try {
    if (id === undefined) { storage.removeItem(PIN_KEY); return true }
    const value = id == null ? 'main' : String(id).toLowerCase()
    if (value !== 'main' && !ID_RE.test(value)) return false
    storage.setItem(PIN_KEY, value)
    return true
  } catch { return false }
}

export function pinnedDashboardLanding(storage = localStorage) {
  try { return storage.getItem(PIN_KEY) } catch { return null }
}

function existing(value, lists) {
  if (!value || value === 'main') return null
  return ID_RE.test(value) && (lists || []).some((item) => item.id === value) ? value : undefined
}

/** Return null for the main board or a currently-existing named-list id.
 *  A valid pin wins; otherwise the last-viewed board decides. */
export function resolveDashboardLanding(lists, storage = localStorage) {
  let pin = null
  try { pin = storage.getItem(PIN_KEY) } catch { /* fall through */ }
  if (pin === 'main') return null
  const pinned = existing(pin, lists)
  if (pinned) return pinned
  let value = null
  try { value = storage.getItem(KEY) } catch { return null }
  const last = existing(value, lists)
  if (last) return last
  if (last === undefined) { try { storage.removeItem(KEY) } catch { /* best-effort */ } }
  return null
}
