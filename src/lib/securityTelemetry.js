import { getTtwDeviceId } from './deviceIdentity.js'
import {
  fixedSyncCapability, validWatchlistCapability,
  watchlistSyncEndpoint, watchlistSyncHeaders,
} from './watchlistSync.js'

const SESSION_KEY = 'ttw_family_view_v1'

export function familyViewEndpoint(capability, base) {
  const sync = watchlistSyncEndpoint(capability, base)
  return sync ? sync.replace(/\/watchlists$/, '/telemetry/family-view') : ''
}

/** One privacy-bounded signal per tab session. It says the family JavaScript
 * actually ran; edge HTML hits remain visible separately in Cloudflare zone
 * analytics and may merely be WeChat/link-preview fetches. There is no retry
 * loop: a failed beacon may try again only on the next page load. */
export async function recordFamilyView({
  capability = fixedSyncCapability(),
  base,
  fetchImpl = globalThis.fetch,
  session = globalThis.sessionStorage,
  deviceId = getTtwDeviceId(),
} = {}) {
  if (!validWatchlistCapability(capability) || !deviceId || typeof fetchImpl !== 'function') return false
  try {
    if (session?.getItem(SESSION_KEY) === 'sent') return true
  } catch { /* storage is optional; the request is still bounded to one call here */ }

  const endpoint = familyViewEndpoint(capability, base)
  if (!endpoint) return false
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: watchlistSyncHeaders(capability, deviceId),
      credentials: 'omit',
      keepalive: true,
    })
    if (!response.ok) return false
    try { session?.setItem(SESSION_KEY, 'sent') } catch { /* best effort */ }
    return true
  } catch {
    return false
  }
}
