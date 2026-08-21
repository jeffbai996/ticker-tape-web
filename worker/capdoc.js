// Capability-scoped document store, shared by the watchlist and portfolio
// sync routes. A capability is both the address and the credential; a route
// built on this exposes no listing and no other surface. Optimistic
// concurrency: POST carries the revision it read, a stale one gets 409 with
// the current row so the client can merge and retry.

const ALLOWED_ORIGINS = new Set([
  'https://jeffbai996.github.io',
  'http://localhost:5199',
  'http://localhost:5173',
  'http://localhost:8098',
])
export const CAPABILITY_RE = /^[a-f0-9]{32}$/

export function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key))
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

async function loadRow(kv, key, validate) {
  const raw = await kv.get(key)
  if (raw == null) return { rev: 0, data: null }
  try {
    const row = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!plainObject(row) || !Number.isSafeInteger(row.rev) || row.rev < 1) return null
    if (validate(row.data).ok === false) return null
    return { rev: row.rev, data: row.data }
  } catch {
    return null
  }
}

/** Build the fetch handler for one document kind.
 *  `route` is the path prefix ('/watchlists/'), `keyPrefix` the KV namespace
 *  prefix, `validate(data) -> {ok, error?}` the document contract, and
 *  `maxBody` the serialized-size ceiling. */
export function makeCapDocHandler({ route, keyPrefix, validate, maxBody }) {
  return async function handle(request, env, path) {
    const capability = path.startsWith(route) ? path.slice(route.length) : ''
    if (!CAPABILITY_RE.test(capability)) {
      return json(request, { ok: false, error: 'not found' }, 404)
    }
    if (!env.SPEND) return json(request, { ok: false, error: 'storage unavailable' }, 503)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsFor(request) })
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
      return json(request, { ok: false, error: 'method not allowed' }, 405)
    }

    const key = `${keyPrefix}${capability}`
    const current = await loadRow(env.SPEND, key, validate)
    if (current == null) return json(request, { ok: false, error: 'stored document invalid' }, 500)
    if (request.method === 'GET') return json(request, { ok: true, ...current })

    const declared = Number(request.headers.get('Content-Length'))
    if (Number.isFinite(declared) && declared > maxBody) {
      return json(request, { ok: false, error: 'document too large' }, 413)
    }
    let payload
    try {
      const text = await request.text()
      if (text.length > maxBody) return json(request, { ok: false, error: 'document too large' }, 413)
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
    const valid = validate(payload.data)
    if (!valid.ok) return json(request, { ok: false, error: valid.error }, 400)
    if (JSON.stringify(payload.data).length > maxBody) {
      return json(request, { ok: false, error: 'document too large' }, 413)
    }
    if (payload.rev !== current.rev) {
      return json(request, { ok: false, error: 'conflict', ...current }, 409)
    }

    const next = { rev: current.rev + 1, data: payload.data }
    await env.SPEND.put(key, JSON.stringify(next))
    return json(request, { ok: true, rev: next.rev })
  }
}
