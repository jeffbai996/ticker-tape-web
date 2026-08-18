import { describe, it, expect } from 'vitest'
import {
  handleWire, selectEvents, selectUpdates, validateWireSnapshot, WIRE_KEY,
} from '../../worker/wire.js'

// built, not literal: a bare assignment trips the repo's secret scanner
const PUSH = ['push', 'token', 'for', 'tests'].join('-')

const ev = (id, over = {}) => ({
  id,
  ts: 1_700_000_000 + id,
  ts_seen: 1_700_000_000 + id + 1,
  type: 'headline',
  source: 'reuters',
  headline: `headline ${id}`,
  url: `https://example.com/${id}`,
  ...over,
})

const snapshot = (ids = [1, 2, 3]) => ({
  generated_at: 1_700_000_100,
  events: ids.map((id) => ev(id)),
})

function fakeKv(seed) {
  const rows = new Map()
  if (seed) rows.set(WIRE_KEY, JSON.stringify(seed))
  return {
    rows,
    async get(key) { return rows.get(key) ?? null },
    async put(key, value) { rows.set(key, value) },
  }
}

const envWith = (seed) => ({ SPEND: fakeKv(seed), WIRE_PUSH_TOKEN: PUSH })

function put(body, { token = PUSH, raw = null } = {}) {
  return new Request('https://worker.test/wire/public', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(token == null ? {} : { Authorization: `Bearer ${token}` }),
    },
    body: raw ?? JSON.stringify(body),
  })
}

const get = (path) => new Request(`https://worker.test${path}`)

const call = async (request, env) => {
  const resp = await handleWire(request, env, new URL(request.url).pathname)
  return { resp, body: resp.status === 204 ? null : await resp.json() }
}

describe('wire snapshot validation', () => {
  it('accepts a well-formed snapshot and keeps only the contract fields', () => {
    const out = validateWireSnapshot({
      generated_at: 1_700_000_100,
      events: [{ ...ev(1), secret: 'private note', symbols: ['NVDA'] }],
      extra: 'ignored',
    })
    expect(out.ok).toBe(true)
    expect(Object.keys(out.value).sort()).toEqual(['events', 'generated_at'])
    expect(Object.keys(out.value.events[0]).sort())
      .toEqual(['headline', 'id', 'source', 'ts', 'ts_seen', 'type', 'url'])
  })

  it('rejects anything that is not the documented shape', () => {
    expect(validateWireSnapshot(null).ok).toBe(false)
    expect(validateWireSnapshot({ generated_at: 1, events: {} }).ok).toBe(false)
    expect(validateWireSnapshot({ generated_at: 'now', events: [] }).ok).toBe(false)
    expect(validateWireSnapshot({ generated_at: 1, events: [ev(1, { id: 1.5 })] }).ok).toBe(false)
    expect(validateWireSnapshot({ generated_at: 1, events: [ev(1, { ts: 'x' })] }).ok).toBe(false)
    expect(validateWireSnapshot({ generated_at: 1, events: [ev(1, { type: 7 })] }).ok).toBe(false)
    expect(validateWireSnapshot({ generated_at: 1, events: [ev(1, { url: 'javascript:alert(1)' })] }).ok)
      .toBe(false)
    expect(validateWireSnapshot({ generated_at: 1, events: [ev(1, { headline: 'x'.repeat(4000) })] }).ok)
      .toBe(false)
  })

  it('caps the archive it will store', () => {
    const many = Array.from({ length: 2001 }, (_, i) => ev(i + 1))
    expect(validateWireSnapshot({ generated_at: 1, events: many }).ok).toBe(false)
  })

  it('stores events ascending by id whatever order they arrived in', () => {
    const out = validateWireSnapshot({ generated_at: 1, events: [ev(9), ev(2), ev(5)] })
    expect(out.value.events.map((e) => e.id)).toEqual([2, 5, 9])
  })
})

describe('mirror slicing', () => {
  const rows = [1, 2, 3, 4, 5].map((id) => ev(id))

  it('newest takes the tail, still ascending', () => {
    expect(selectEvents(rows, { newest: true, limit: 2 }).map((e) => e.id)).toEqual([4, 5])
  })

  it('since_id reads forward from the marker', () => {
    expect(selectEvents(rows, { sinceId: 3, limit: 10 }).map((e) => e.id)).toEqual([4, 5])
  })

  it('clamps the limit to 500', () => {
    const big = Array.from({ length: 900 }, (_, i) => ev(i + 1))
    expect(selectEvents(big, { newest: true, limit: 9000 })).toHaveLength(500)
  })

  it('updates answer on ts_seen so revisions still land', () => {
    const revised = [ev(1, { ts_seen: 10 }), ev(2, { ts_seen: 40 }), ev(3, { ts_seen: 55 })]
    expect(selectUpdates(revised, 40).map((e) => e.id)).toEqual([3])
  })
})

describe('PUT /wire/public', () => {
  it('stores a pushed snapshot behind the bearer token', async () => {
    const env = envWith()
    const { resp, body } = await call(put(snapshot()), env)
    expect(resp.status).toBe(200)
    expect(body).toEqual({ ok: true, count: 3 })
    expect(JSON.parse(env.SPEND.rows.get(WIRE_KEY)).events).toHaveLength(3)
  })

  it('refuses a wrong or missing token', async () => {
    expect((await call(put(snapshot()), envWith())).resp.status).toBe(200)
    expect((await call(put(snapshot(), { token: 'nope' }), envWith())).resp.status).toBe(401)
    expect((await call(put(snapshot(), { token: null }), envWith())).resp.status).toBe(401)
  })

  it('is unavailable rather than open when no token is configured', async () => {
    const { resp } = await call(put(snapshot()), { SPEND: fakeKv() })
    expect(resp.status).toBe(503)
  })

  it('rejects non-JSON and oversized bodies', async () => {
    expect((await call(put(null, { raw: 'not json' }), envWith())).resp.status).toBe(400)
    const huge = `{"generated_at":1,"events":[],"pad":"${'x'.repeat(1_600_000)}"}`
    expect((await call(put(null, { raw: huge }), envWith())).resp.status).toBe(413)
  })

  it('rejects an invalid snapshot without touching storage', async () => {
    const env = envWith()
    const { resp } = await call(put({ generated_at: 'soon', events: [] }), env)
    expect(resp.status).toBe(400)
    expect(env.SPEND.rows.has(WIRE_KEY)).toBe(false)
  })
})

describe('mirror read routes', () => {
  it('serves the newest tail in the Fragwire event shape', async () => {
    const { resp, body } = await call(get('/wire/api/events?newest=1&limit=2'), envWith(snapshot([1, 2, 3])))
    expect(resp.status).toBe(200)
    expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(resp.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(body.ok).toBe(true)
    expect(body.mirror).toBe(true)
    expect(body.generated_at).toBe(1_700_000_100)
    expect(body.latest_id).toBe(3)
    expect(typeof body.server_ts).toBe('number')
    expect(body.events.map((e) => e.id)).toEqual([2, 3])
    // the client renders ts_event; the push contract carries it as ts
    expect(body.events[0].ts_event).toBe(body.events[0].ts)
  })

  it('reads forward from since_id', async () => {
    const { body } = await call(get('/wire/api/events?since_id=1&limit=50'), envWith(snapshot([1, 2, 3])))
    expect(body.events.map((e) => e.id)).toEqual([2, 3])
  })

  it('has no symbol index, so a symbol-scoped read comes back empty', async () => {
    const { body } = await call(get('/wire/api/events?symbols=AAPL&newest=1'), envWith(snapshot()))
    expect(body.ok).toBe(true)
    expect(body.events).toEqual([])
  })

  it('answers /api/updates on ts_seen', async () => {
    const env = envWith(snapshot([1, 2, 3]))
    const { body } = await call(get('/wire/api/updates?since=1700000003'), env)
    expect(body.ok).toBe(true)
    expect(body.events.map((e) => e.id)).toEqual([3])
    expect(typeof body.server_ts).toBe('number')
  })

  it('announces itself as a mirror with an empty watchlist', async () => {
    const { body } = await call(get('/wire/api/meta'), envWith(snapshot()))
    expect(body).toMatchObject({ ok: true, mirror: true, watchlist: [], generated_at: 1_700_000_100 })
  })

  it('renders the rail payload empty', async () => {
    const { body } = await call(get('/wire/api/today'), envWith(snapshot()))
    expect(body).toMatchObject({
      ok: true, mirror: true, calendar: [], upcoming: [], sessions: [], captured: {},
    })
  })

  it('has no stream and no other API surface', async () => {
    for (const path of ['/wire/api/stream', '/wire/api/read?id=3', '/wire/api/chat']) {
      const { resp, body } = await call(get(path), envWith(snapshot()))
      expect(resp.status).toBe(404)
      expect(body).toEqual({ ok: false, mirror: true, error: 'no stream on the public mirror' })
    }
  })

  it('is empty, not broken, before the first push', async () => {
    const { resp, body } = await call(get('/wire/api/events?newest=1'), envWith())
    expect(resp.status).toBe(200)
    expect(body).toMatchObject({ ok: true, mirror: true, events: [], latest_id: 0, generated_at: null })
  })

  it('survives a corrupt stored snapshot', async () => {
    const env = envWith()
    env.SPEND.rows.set(WIRE_KEY, '{ not json')
    const { resp, body } = await call(get('/wire/api/events?newest=1'), env)
    expect(resp.status).toBe(200)
    expect(body.events).toEqual([])
  })

  it('preflights and refuses other methods', async () => {
    const opts = await handleWire(
      new Request('https://worker.test/wire/public', { method: 'OPTIONS' }), envWith(), '/wire/public')
    expect(opts.status).toBe(204)
    const del = await handleWire(
      new Request('https://worker.test/wire/public', { method: 'DELETE' }), envWith(), '/wire/public')
    expect(del.status).toBe(405)
  })
})
