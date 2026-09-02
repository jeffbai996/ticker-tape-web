// Privacy-bounded security telemetry for the family page and its capability-
// scoped documents. Cloudflare already sees the edge request; this log adds
// only the small, stable dimensions needed to distinguish ordinary family use
// from discovery or state tampering. Tokens, bodies, symbols, names, raw IPs,
// full user agents, and full URLs never enter our custom event.

export const SECURITY_EVENT = 'ttw_security'
export const SECURITY_SCHEMA = 1

const CAPABILITY_RE = /^[a-f0-9]{32}$/
const DEVICE_RE = /^[A-Za-z0-9._:-]{1,64}$/
const SAFE_ID_RE = /^[A-Za-z0-9._:-]{1,96}$/
const ALLOWED_FAMILY_ORIGINS = new Set([
  'https://jeffbai.com',
  'https://jeffbai996.github.io',
  'http://localhost:5199',
  'http://localhost:5173',
  'http://localhost:8098',
])

function safeEqual(left, right) {
  const a = String(left || '')
  const b = String(right || '')
  let different = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    different |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return different === 0
}

function bearer(request) {
  const match = /^Bearer ([a-f0-9]{32})$/.exec(request.headers.get('Authorization') || '')
  return match?.[1] || ''
}

export function familyOriginAllowed(request) {
  return ALLOWED_FAMILY_ORIGINS.has(request.headers.get('Origin') || '')
}

export function familyCorsFor(request) {
  const origin = request.headers.get('Origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_FAMILY_ORIGINS.has(origin)
      ? origin : 'https://jeffbai996.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Capdoc-Intent, X-TTW-Device-ID',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

export function familyAuthState(request, env) {
  const header = request.headers.get('Authorization') || ''
  if (!header) return 'missing'
  const candidate = bearer(request)
  if (!candidate) return 'invalid'
  const expected = String(env.FAMILY_SYNC_TOKEN || '')
  if (!CAPABILITY_RE.test(expected)) return 'unavailable'
  return safeEqual(candidate, expected) ? 'ok' : 'invalid'
}

export function coarseUserAgent(value) {
  const ua = String(value || '')
  if (/ttw-backup/i.test(ua)) return 'ttw-backup'
  if (/MicroMessenger/i.test(ua)) return 'wechat'
  if (/bot|crawler|spider|preview|facebookexternalhit|slurp/i.test(ua)) return 'bot-or-preview'
  if (/iP(?:hone|ad|od).+Safari/i.test(ua)) return 'ios-safari'
  if (/Android.+(?:Chrome|CriOS)/i.test(ua)) return 'android-chrome'
  if (/(?:Chrome|CriOS|Edg)\//i.test(ua)) return 'chromium'
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox'
  if (/Safari/i.test(ua)) return 'safari'
  return ua ? 'other' : 'unknown'
}

function cleanId(value, fallback = 'unknown') {
  const text = String(value || '')
  return SAFE_ID_RE.test(text) ? text : fallback
}

async function hmacPseudonym(value, secret, label) {
  const raw = String(value || '')
  const keyText = String(secret || '')
  if (!raw || keyText.length < 32 || !globalThis.crypto?.subtle) return 'unavailable'
  const encoder = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey(
    'raw', encoder.encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const signed = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(`${label}:${raw}`))
  const hex = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${label}:${hex.slice(0, 20)}`
}

function operationFor(path, method) {
  if (path.endsWith('/history')) return 'history'
  if (path.endsWith('/restore')) return 'restore'
  if (method === 'POST') return 'write'
  if (method === 'GET') return 'read'
  return `method_${String(method || 'unknown').toLowerCase()}`
}

function resourceFor(path) {
  return path.startsWith('/portfolios') ? 'portfolios' : 'watchlists'
}

function safeOutcome(status, payload) {
  if (status >= 200 && status < 300) return 'ok'
  const known = new Set([
    'authentication required', 'family sync unavailable', 'storage unavailable',
    'method not allowed', 'not found', 'revision not kept', 'invalid revision',
    'document too large', 'invalid json', 'stored document invalid',
    'shrink', 'conflict',
  ])
  return known.has(payload?.error) ? payload.error.replaceAll(' ', '_') : `http_${status}`
}

async function eventBase(request, env) {
  const cf = request.cf || {}
  const rawDevice = request.headers.get('X-TTW-Device-ID') || ''
  const device = DEVICE_RE.test(rawDevice)
    ? await hmacPseudonym(rawDevice, env.TTW_AUDIT_KEY, 'device')
    : 'missing'
  const network = await hmacPseudonym(
    request.headers.get('CF-Connecting-IP') || '', env.TTW_AUDIT_KEY, 'network',
  )
  return {
    event: SECURITY_EVENT,
    schema: SECURITY_SCHEMA,
    ray: cleanId(request.headers.get('CF-Ray')),
    country: cleanId(cf.country || request.headers.get('CF-IPCountry')),
    asn: Number.isSafeInteger(cf.asn) ? cf.asn : 0,
    colo: cleanId(cf.colo),
    device,
    network,
    user_agent: coarseUserAgent(request.headers.get('User-Agent')),
  }
}

export async function emitSecurityEvent(request, env, fields) {
  if (String(env.TTW_SECURITY_LOGGING || '') !== '1') return null
  const row = { ...(await eventBase(request, env)), ...fields }
  // Log an object, not a formatted string: Workers Logs indexes these fields
  // individually for Query Builder. Keep this as the only custom log sink.
  console.log(row)
  return row
}

function schedule(ctx, promise) {
  const safe = promise.catch(() => null)
  if (ctx?.waitUntil) {
    ctx.waitUntil(safe)
    return null
  }
  return safe
}

async function responsePayload(response) {
  try {
    if (!(response.headers.get('Content-Type') || '').includes('application/json')) return {}
    return await response.clone().json()
  } catch {
    return {}
  }
}

export async function withFamilyDocumentLog(request, env, path, ctx, handler) {
  // Authorization on a cross-origin fetch produces a browser preflight. It is
  // transport machinery, not a document access or failed authentication.
  if (request.method === 'OPTIONS') return handler()
  const started = Date.now()
  let response
  try {
    response = await handler()
  } catch (error) {
    const pending = emitSecurityEvent(request, env, {
      kind: 'document', resource: resourceFor(path), operation: operationFor(path, request.method),
      auth: familyAuthState(request, env), status: 500, outcome: 'exception',
      intent: request.headers.get('X-Capdoc-Intent') === 'delete' ? 'delete' : 'none',
      revision_before: null, revision_after: null, duration_ms: Date.now() - started,
    })
    const waiting = schedule(ctx, pending)
    if (waiting) await waiting
    throw error
  }

  const pending = (async () => {
    const payload = await responsePayload(response)
    const revision = Number.isSafeInteger(payload.rev) ? payload.rev : null
    const successfulWrite = request.method === 'POST' && response.ok && revision !== null
    return emitSecurityEvent(request, env, {
      kind: 'document',
      resource: resourceFor(path),
      operation: operationFor(path, request.method),
      auth: familyAuthState(request, env),
      status: response.status,
      outcome: safeOutcome(response.status, payload),
      intent: request.headers.get('X-Capdoc-Intent') === 'delete' ? 'delete' : 'none',
      revision_before: successfulWrite ? revision - 1 : revision,
      revision_after: response.ok ? revision : null,
      duration_ms: Date.now() - started,
    })
  })()
  const waiting = schedule(ctx, pending)
  if (waiting) await waiting
  return response
}

export async function handleFamilyView(request, env, ctx) {
  const cors = familyCorsFor(request)
  if (request.method === 'OPTIONS') {
    return familyOriginAllowed(request)
      ? new Response(null, { status: 204, headers: cors })
      : new Response(null, { status: 403, headers: { 'Cache-Control': 'no-store' } })
  }
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: cors })
  if (!familyOriginAllowed(request)) return new Response(null, { status: 403, headers: cors })
  if (familyAuthState(request, env) !== 'ok') {
    return new Response(null, {
      status: 401,
      headers: { ...cors, 'WWW-Authenticate': 'Bearer realm="ticker-tape-family"' },
    })
  }
  if (!DEVICE_RE.test(request.headers.get('X-TTW-Device-ID') || '')) {
    return new Response(null, { status: 400, headers: cors })
  }
  const waiting = schedule(ctx, emitSecurityEvent(request, env, {
    kind: 'browser', resource: 'family_page', operation: 'view', auth: 'ok',
    status: 204, outcome: 'ok', intent: 'none',
    revision_before: null, revision_after: null, duration_ms: 0,
  }))
  if (waiting) await waiting
  return new Response(null, { status: 204, headers: cors })
}
