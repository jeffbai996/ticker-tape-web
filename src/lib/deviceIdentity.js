const DEVICE_KEY = 'ttw_device_id_v1'
const DEVICE_RE = /^[a-f0-9]{32}$/

export function validTtwDeviceId(value) {
  return DEVICE_RE.test(String(value || ''))
}

function freshDeviceId(cryptoApi) {
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID().replaceAll('-', '').toLowerCase()
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoApi.getRandomValues(bytes)
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  return ''
}

export function getTtwDeviceId(
  storage = globalThis.localStorage,
  cryptoApi = globalThis.crypto,
) {
  try {
    const existing = storage?.getItem(DEVICE_KEY) || ''
    if (validTtwDeviceId(existing)) return existing
    const created = freshDeviceId(cryptoApi)
    if (!created) return ''
    storage?.setItem(DEVICE_KEY, created)
    return created
  } catch {
    return ''
  }
}

export function ttwDeviceHeader(deviceId = getTtwDeviceId()) {
  return validTtwDeviceId(deviceId) ? { 'X-TTW-Device-ID': deviceId } : {}
}
