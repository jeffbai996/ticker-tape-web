// Capability-scoped watchlist sync for the public build. A capability is both
// the document address and its credential; this route exposes no listing,
// account, wire, chatstore, calendar, or portfolio surface.

const ALLOWED_ORIGINS = new Set([
  'https://jeffbai996.github.io',
  'http://localhost:5199',
  'http://localhost:5173',
])
const CAPABILITY_RE = /^[a-f0-9]{32}$/
const SYMBOL_RE = /^[A-Z0-9.^=-]{1,12}$/
const LIST_ID_RE = /^[a-z0-9-]{1,40}$/
const MAX_MAIN_SYMBOLS = 60
const MAX_NAMED_LISTS = 32
const MAX_LIST_SYMBOLS = 60
const MAX_NAME_CHARS = 32
const MAX_BODY_BYTES = 48_000

export function validWatchlistCapability(value) {
  return CAPABILITY_RE.test(String(value || ''))
}

export function watchlistStorageKey(capability) {
  if (!validWatchlistCapability(capability)) return ''
  return `watchlist:${capability}`
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key))
}

function validSymbols(value, limit) {
  return Array.isArray(value)
    && value.length <= limit
    && new Set(value).size === value.length
    && value.every((symbol) => typeof symbol === 'string' && SYMBOL_RE.test(symbol))
}

function validClock(value, allowedParts, allowDeletedIds = false) {
  if (!plainObject(value) || Object.keys(value).length > MAX_NAMED_LISTS + 1) return false
  return Object.entries(value).every(([part, stamp]) =>
    (allowedParts.has(part) || (allowDeletedIds && LIST_ID_RE.test(part)))
    && Number.isSafeInteger(stamp)
    && stamp >= 0)
}

export function validateWatchlistDocument(value) {
  if (!plainObject(value)
      || !exactKeys(value, new Set(['main', 'lists', 'touched', 'deleted']))) {
    return { ok: false, error: 'invalid document shape' }
  }
  if (!validSymbols(value.main, MAX_MAIN_SYMBOLS)) {
    return { ok: false, error: 'invalid main watchlist' }
  }
  if (!Array.isArray(value.lists) || value.lists.length > MAX_NAMED_LISTS) {
    return { ok: false, error: 'invalid named watchlists' }
  }
  const ids = new Set()
  for (const list of value.lists) {
    if (!plainObject(list)
        || !exactKeys(list, new Set(['id', 'name', 'symbols']))
        || typeof list.id !== 'string'
        || !LIST_ID_RE.test(list.id)
        || ids.has(list.id)
        || typeof list.name !== 'string'
        || !list.name.trim()
        || list.name.length > MAX_NAME_CHARS
        || !validSymbols(list.symbols, MAX_LIST_SYMBOLS)) {
      return { ok: false, error: 'invalid named watchlist' }
    }
    ids.add(list.id)
  }
  const parts = new Set(['main', ...ids])
  if (!validClock(value.touched, parts) || !validClock(value.deleted, parts, true)) {
    return { ok: false, error: 'invalid sync metadata' }
  }
  if (JSON.stringify(value).length > MAX_BODY_BYTES) {
    return { ok: false, error: 'document too large' }
  }
  return { ok: true }
}

function corsFor(request) {
  const origin = request.headers.get('Origin')
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin)
      ? origin : 'https://jeffbai996.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsFor(request), 'Content-Type': 'application/json' },
  })
}

async function loadRow(kv, key) {
  const raw = await kv.get(key)
  if (raw == null) return { rev: 0, data: null }
  try {
    const row = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!plainObject(row) || !Number.isSafeInteger(row.rev) || row.rev < 1) return null
    if (validateWatchlistDocument(row.data).ok === false) return null
    return { rev: row.rev, data: row.data }
  } catch {
    return null
  }
}

export async function handleWatchlists(request, env, path) {
  const capability = path.startsWith('/watchlists/')
    ? path.slice('/watchlists/'.length) : ''
  if (!validWatchlistCapability(capability)) {
    return json(request, { ok: false, error: 'not found' }, 404)
  }
  if (!env.SPEND) return json(request, { ok: false, error: 'storage unavailable' }, 503)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsFor(request) })
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json(request, { ok: false, error: 'method not allowed' }, 405)
  }

  const key = watchlistStorageKey(capability)
  const current = await loadRow(env.SPEND, key)
  if (current == null) return json(request, { ok: false, error: 'stored document invalid' }, 500)
  if (request.method === 'GET') return json(request, { ok: true, ...current })

  const declared = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json(request, { ok: false, error: 'document too large' }, 413)
  }
  let payload
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return json(request, { ok: false, error: 'document too large' }, 413)
    payload = JSON.parse(text)
  } catch {
    return json(request, { ok: false, error: 'invalid json' }, 400)
  }
  if (!plainObject(payload)
      || !exactKeys(payload, new Set(['rev', 'data']))
      || !Number.isSafeInteger(payload.rev)
      || payload.rev < 0) {
    return json(request, { ok: false, error: 'invalid revision' }, 400)
  }
  const valid = validateWatchlistDocument(payload.data)
  if (!valid.ok) return json(request, { ok: false, error: valid.error }, 400)
  if (payload.rev !== current.rev) {
    return json(request, { ok: false, error: 'conflict', ...current }, 409)
  }

  const next = { rev: current.rev + 1, data: payload.data }
  await env.SPEND.put(key, JSON.stringify(next))
  return json(request, { ok: true, rev: next.rev })
}
