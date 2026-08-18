// Public wire mirror. A private exporter PUSHes a sanitized headline snapshot
// here every few minutes; the public site READS it. There is no stream, no
// symbol index, no article extraction and no chat — this is a flat archive of
// headlines with their source links, nothing more.
//
// Everything stored arrives through validateWireSnapshot, which keeps only the
// seven contract fields per event and drops anything else the pusher sends, so
// no private field can leak into a public response by accident.

export const WIRE_KEY = 'wire:public'

const MAX_EVENTS = 2000
const MAX_BODY_BYTES = 1_500_000
const MAX_LIMIT = 500
const DEFAULT_LIMIT = 100
const MAX_TAG_CHARS = 64
const MAX_HEADLINE_CHARS = 1000
const MAX_URL_CHARS = 2048

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function plainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function tag(value, max) {
  return typeof value === 'string' && value.length <= max
}

function num(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

/** One pushed event, reduced to the contract fields. Returns null when the
 *  row is malformed — the whole push is then rejected, so a broken exporter
 *  never half-writes the public archive. */
function cleanEvent(row) {
  if (!plainObject(row)) return null
  if (!Number.isSafeInteger(row.id) || row.id < 0) return null
  if (!num(row.ts) || !num(row.ts_seen)) return null
  if (!tag(row.type, MAX_TAG_CHARS) || !tag(row.source, MAX_TAG_CHARS)) return null
  if (!tag(row.headline, MAX_HEADLINE_CHARS) || !row.headline.trim()) return null
  if (!tag(row.url, MAX_URL_CHARS)) return null
  if (row.url && !/^https?:\/\//i.test(row.url)) return null
  return {
    id: row.id,
    ts: row.ts,
    ts_seen: row.ts_seen,
    type: row.type,
    source: row.source,
    headline: row.headline,
    url: row.url,
  }
}

export function validateWireSnapshot(payload) {
  if (!plainObject(payload)) return { ok: false, error: 'invalid snapshot' }
  if (!num(payload.generated_at) || payload.generated_at < 0) {
    return { ok: false, error: 'invalid generated_at' }
  }
  if (!Array.isArray(payload.events)) return { ok: false, error: 'invalid events' }
  if (payload.events.length > MAX_EVENTS) return { ok: false, error: 'too many events' }
  const events = []
  for (const row of payload.events) {
    const clean = cleanEvent(row)
    if (!clean) return { ok: false, error: 'invalid event' }
    events.push(clean)
  }
  events.sort((a, b) => a.id - b.id)
  return { ok: true, value: { generated_at: payload.generated_at, events } }
}

function clampLimit(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.floor(n))
}

/** Fragwire's /api/events semantics: ascending by id either way. `newest`
 *  takes the TAIL of the archive, since_id reads forward from a marker. */
export function selectEvents(events, { newest = false, sinceId = 0, limit } = {}) {
  const n = clampLimit(limit)
  const rows = events.slice().sort((a, b) => a.id - b.id)
  if (newest) return rows.slice(-n)
  return rows.filter((ev) => ev.id > sinceId).slice(0, n)
}

/** Revisions: rows the exporter has touched since the client's marker. */
export function selectUpdates(events, since) {
  const marker = Number(since)
  const cut = Number.isFinite(marker) ? marker : 0
  return events
    .filter((ev) => ev.ts_seen > cut)
    .sort((a, b) => a.id - b.id)
    .slice(0, MAX_LIMIT)
}

// The browser renders ts_event; the push contract carries the same instant as
// `ts`. Alias it on the way out rather than storing the field twice.
function outEvent(ev) {
  return { ...ev, ts_event: ev.ts }
}

function json(data, status = 200, cache = 'public, max-age=60') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': cache },
  })
}

const EMPTY = { generated_at: null, events: [] }

async function loadSnapshot(kv) {
  if (!kv) return EMPTY
  try {
    const raw = await kv.get(WIRE_KEY)
    if (raw == null) return EMPTY
    const row = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!plainObject(row) || !Array.isArray(row.events)) return EMPTY
    return { generated_at: num(row.generated_at) ? row.generated_at : null, events: row.events }
  } catch {
    return EMPTY                     // a corrupt snapshot reads as "nothing yet"
  }
}

/** Length-independent only for equal-length strings, which is all a bearer
 *  token comparison needs — the length itself is not a secret. */
function safeEqual(a, b) {
  const x = String(a ?? '')
  const y = String(b ?? '')
  if (x.length !== y.length || !x.length) return false
  let diff = 0
  for (let i = 0; i < x.length; i += 1) diff |= x.charCodeAt(i) ^ y.charCodeAt(i)
  return diff === 0
}

function bearer(request) {
  const header = request.headers.get('Authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

async function handlePush(request, env) {
  if (!env.WIRE_PUSH_TOKEN) return json({ ok: false, error: 'push disabled' }, 503, 'no-store')
  if (!safeEqual(bearer(request), env.WIRE_PUSH_TOKEN)) {
    return json({ ok: false, error: 'unauthorized' }, 401, 'no-store')
  }
  if (!env.SPEND) return json({ ok: false, error: 'storage unavailable' }, 503, 'no-store')

  const declared = Number(request.headers.get('Content-Length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ ok: false, error: 'snapshot too large' }, 413, 'no-store')
  }
  let payload
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) {
      return json({ ok: false, error: 'snapshot too large' }, 413, 'no-store')
    }
    payload = JSON.parse(text)
  } catch {
    return json({ ok: false, error: 'invalid json' }, 400, 'no-store')
  }
  const valid = validateWireSnapshot(payload)
  if (!valid.ok) return json({ ok: false, error: valid.error }, 400, 'no-store')

  await env.SPEND.put(WIRE_KEY, JSON.stringify(valid.value))
  return json({ ok: true, count: valid.value.events.length }, 200, 'no-store')
}

export async function handleWire(request, env, path) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (path === '/wire/public') {
    if (request.method !== 'PUT') return json({ ok: false, error: 'method not allowed' }, 405, 'no-store')
    return handlePush(request, env)
  }
  if (request.method !== 'GET') {
    return json({ ok: false, error: 'method not allowed' }, 405, 'no-store')
  }

  const url = new URL(request.url)
  const q = url.searchParams
  const snap = await loadSnapshot(env.SPEND)
  const latestId = snap.events.length ? snap.events[snap.events.length - 1].id : 0
  const serverTs = Date.now() / 1000
  const base = { ok: true, mirror: true, generated_at: snap.generated_at }

  if (path === '/wire/api/events') {
    // No symbol index on the mirror: a symbol-scoped read answers empty rather
    // than handing back unrelated headlines.
    const events = q.has('symbols') ? [] : selectEvents(snap.events, {
      newest: q.get('newest') === '1',
      sinceId: Number(q.get('since_id')) || 0,
      limit: q.get('limit'),
    })
    return json({ ...base, events: events.map(outEvent), latest_id: latestId, server_ts: serverTs })
  }
  if (path === '/wire/api/updates') {
    const events = selectUpdates(snap.events, q.get('since'))
    return json({ ...base, events: events.map(outEvent), latest_id: latestId, server_ts: serverTs })
  }
  if (path === '/wire/api/meta') {
    return json({ ...base, watchlist: [] })
  }
  if (path === '/wire/api/today') {
    return json({ ...base, calendar: [], upcoming: [], captured: {}, sessions: [] })
  }
  return json({ ok: false, mirror: true, error: 'no stream on the public mirror' }, 404, 'no-store')
}
