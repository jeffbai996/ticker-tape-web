// Capability-scoped document store, shared by the watchlist and portfolio
// sync routes. The capability is a bearer credential and never enters the
// URL. A Durable Object serializes each document's revision check and write;
// KV remains a migration source/write-through backup, not the coordinator.

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
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

function parseRow(raw) {
  if (raw == null) return { rev: 0, data: null }
  try {
    const row = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!plainObject(row) || !Number.isSafeInteger(row.rev) || row.rev < 0) return null
    if (row.rev === 0 && row.data !== null) return null
    return { rev: row.rev, data: row.data }
  } catch {
    return null
  }
}

function bearerCapability(request) {
  const match = /^Bearer ([a-f0-9]{32})$/.exec(request.headers.get('Authorization') || '')
  return match?.[1] || ''
}

export function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left))
  const b = new TextEncoder().encode(String(right))
  let different = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    different |= (a[i] || 0) ^ (b[i] || 0)
  }
  return different === 0
}

const STORAGE_KEY_RE = /^(?:watchlist|myportfolios):[a-f0-9]{32}$/

/** Single-writer coordinator. One object exists per kind + capability. The
 * queue also orders the legacy KV write-through; the authoritative row lives
 * in strongly consistent Durable Object storage. */
export class CapDocCoordinator {
  constructor(state, env) {
    this.state = state
    this.env = env
    this.tail = Promise.resolve()
    this.migration = null
    this.key = ''
  }

  fetch(request) {
    const run = this.tail.then(() => this.handle(request))
    this.tail = run.catch(() => {})
    return run
  }

  async migrate(key) {
    if (this.key && this.key !== key) throw new Error('coordinator key mismatch')
    this.key = key
    if (!this.migration) {
      this.migration = (async () => {
        if (await this.state.storage.get('row') !== undefined) return
        const legacy = await this.env.SPEND?.get(key)
        if (legacy != null) await this.state.storage.put('row', legacy)
      })()
    }
    await this.migration
  }

  async handle(request) {
    const key = request.headers.get('X-Capdoc-Key') || ''
    if (!STORAGE_KEY_RE.test(key)) return new Response(null, { status: 400 })
    await this.migrate(key)
    const current = parseRow(await this.state.storage.get('row'))
    if (current == null) return Response.json({ error: 'stored document invalid' }, { status: 500 })
    if (request.method === 'GET') return Response.json({ row: current })
    if (request.method !== 'POST') return new Response(null, { status: 405 })

    const update = await request.json()
    if (!Number.isSafeInteger(update.expectedRev) || update.expectedRev < 0) {
      return new Response(null, { status: 400 })
    }
    if (update.expectedRev !== current.rev) {
      return Response.json({ conflict: true, row: current }, { status: 409 })
    }
    const next = { rev: current.rev + 1, data: update.data }
    const raw = JSON.stringify(next)
    await this.state.storage.put('row', raw)
    if (this.env.SPEND) await this.env.SPEND.put(key, raw)
    return Response.json({ rev: next.rev })
  }
}

async function coordinate(env, key, method, data) {
  if (!env.CAP_DOCS) return new Response(null, { status: 503 })
  const id = env.CAP_DOCS.idFromName(key)
  return env.CAP_DOCS.get(id).fetch('https://capdoc.invalid/', {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Capdoc-Key': key },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
}

/** Build the fetch handler for one document kind.
 *  `route` is the exact path ('/watchlists'), `keyPrefix` the storage
 *  prefix, `validate(data) -> {ok, error?}` the document contract, and
 *  `maxBody` the serialized-size ceiling. */
export function makeCapDocHandler({ route, keyPrefix, validate, maxBody }) {
  return async function handle(request, env, path) {
    if (path !== route) {
      return json(request, { ok: false, error: 'not found' }, 404)
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsFor(request) })
    }
    if (request.method !== 'GET' && request.method !== 'POST') {
      return json(request, { ok: false, error: 'method not allowed' }, 405)
    }
    const capability = bearerCapability(request)
    if (!CAPABILITY_RE.test(capability)) {
      return json(request, { ok: false, error: 'authentication required' }, 401)
    }
    if (!CAPABILITY_RE.test(env.FAMILY_SYNC_TOKEN || '')) {
      return json(request, { ok: false, error: 'family sync unavailable' }, 503)
    }
    if (!constantTimeEqual(capability, env.FAMILY_SYNC_TOKEN)) {
      return json(request, { ok: false, error: 'authentication required' }, 401)
    }
    if (!env.SPEND || !env.CAP_DOCS) {
      return json(request, { ok: false, error: 'storage unavailable' }, 503)
    }

    const key = `${keyPrefix}${capability}`
    if (request.method === 'GET') {
      const result = await coordinate(env, key, 'GET')
      if (!result.ok) return json(request, { ok: false, error: 'storage unavailable' }, result.status)
      const current = parseRow((await result.json()).row)
      if (current == null || (current.data !== null && !validate(current.data).ok)) {
        return json(request, { ok: false, error: 'stored document invalid' }, 500)
      }
      return json(request, { ok: true, ...current })
    }

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
    const result = await coordinate(env, key, 'POST', {
      expectedRev: payload.rev,
      data: payload.data,
    })
    const out = await result.json().catch(() => ({}))
    if (result.status === 409) {
      const current = parseRow(out.row)
      if (current == null || (current.data !== null && !validate(current.data).ok)) {
        return json(request, { ok: false, error: 'stored document invalid' }, 500)
      }
      return json(request, { ok: false, error: 'conflict', ...current }, 409)
    }
    if (!result.ok || !Number.isSafeInteger(out.rev)) {
      return json(request, { ok: false, error: 'storage unavailable' }, result.status || 503)
    }
    return json(request, { ok: true, rev: out.rev })
  }
}
