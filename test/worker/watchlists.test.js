import { describe, it, expect } from 'vitest'
import {
  handleWatchlists, validWatchlistCapability, validateWatchlistDocument,
  watchlistStorageKey,
} from '../../worker/watchlists.js'

const TOKEN = '0'.repeat(32)
const ORIGIN = 'https://jeffbai996.github.io'
const doc = {
  main: ['AAPL', 'BRK-B'],
  lists: [{ id: 'semis', name: 'Semis', symbols: ['NVDA', 'MU'] }],
  touched: { main: 10, semis: 20 },
  deleted: {},
}

function fakeKv() {
  const rows = new Map()
  return {
    rows,
    async get(key, type) {
      const raw = rows.get(key)
      if (raw == null) return null
      return type === 'json' ? JSON.parse(raw) : raw
    },
    async put(key, value) { rows.set(key, value) },
  }
}

function req(method = 'GET', body, token = TOKEN) {
  return new Request(`https://worker.test/watchlists/${token}`, {
    method,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  })
}

describe('watchlist capability contract', () => {
  it('accepts only full-entropy URL-safe capability ids', () => {
    expect(validWatchlistCapability(TOKEN)).toBe(true)
    expect(validWatchlistCapability('short')).toBe(false)
    expect(validWatchlistCapability(`${TOKEN}/anything`)).toBe(false)
    expect(validWatchlistCapability('g'.repeat(32))).toBe(false)
  })

  it('namespaces every document behind its capability', () => {
    expect(watchlistStorageKey(TOKEN)).toBe(`watchlist:${TOKEN}`)
  })
})

describe('watchlist document validation', () => {
  it('accepts the exact local watchlist shape', () => {
    expect(validateWatchlistDocument(doc)).toEqual({ ok: true })
  })

  it('accepts tombstones for lists no longer present in the document', () => {
    expect(validateWatchlistDocument({ ...doc, deleted: { retired: 30 } })).toEqual({ ok: true })
  })

  it('rejects invalid symbols, duplicate ids, and oversized lists', () => {
    expect(validateWatchlistDocument({ ...doc, main: ['not a symbol'] }).ok).toBe(false)
    expect(validateWatchlistDocument({ ...doc, lists: [doc.lists[0], doc.lists[0]] }).ok).toBe(false)
    expect(validateWatchlistDocument({ ...doc, main: Array.from({ length: 61 }, (_, i) => `S${i}`) }).ok).toBe(false)
  })

  it('rejects junk metadata and oversized payloads', () => {
    expect(validateWatchlistDocument({ ...doc, touched: { main: -1 } }).ok).toBe(false)
    expect(validateWatchlistDocument({ ...doc, extra: 'x' }).ok).toBe(false)
    expect(validateWatchlistDocument({ ...doc, lists: [{ id: 'x', name: 'x'.repeat(40), symbols: [] }] }).ok).toBe(false)
  })
})

describe('watchlist sync route', () => {
  it('creates, reads, and isolates documents by capability', async () => {
    const kv = fakeKv()
    const created = await handleWatchlists(req('POST', { rev: 0, data: doc }), { SPEND: kv }, `/watchlists/${TOKEN}`)
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ ok: true, rev: 1 })

    const fetched = await handleWatchlists(req(), { SPEND: kv }, `/watchlists/${TOKEN}`)
    expect(await fetched.json()).toEqual({ ok: true, rev: 1, data: doc })

    const other = 'fedcba9876543210fedcba9876543210'
    const missing = await handleWatchlists(req('GET', null, other), { SPEND: kv }, `/watchlists/${other}`)
    expect(await missing.json()).toEqual({ ok: true, rev: 0, data: null })
  })

  it('returns the current document on a stale revision', async () => {
    const kv = fakeKv()
    await handleWatchlists(req('POST', { rev: 0, data: doc }), { SPEND: kv }, `/watchlists/${TOKEN}`)
    const stale = await handleWatchlists(req('POST', { rev: 0, data: { ...doc, main: ['TSM'] } }), { SPEND: kv }, `/watchlists/${TOKEN}`)
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ ok: false, error: 'conflict', rev: 1, data: doc })
  })

  it('rejects malformed tokens, documents, and methods without writing', async () => {
    const kv = fakeKv()
    expect((await handleWatchlists(req('GET', null, 'bad'), { SPEND: kv }, '/watchlists/bad')).status).toBe(404)
    expect((await handleWatchlists(req('POST', { rev: 0, data: { ...doc, main: ['bad symbol'] } }), { SPEND: kv }, `/watchlists/${TOKEN}`)).status).toBe(400)
    expect((await handleWatchlists(req('DELETE'), { SPEND: kv }, `/watchlists/${TOKEN}`)).status).toBe(405)
    expect(kv.rows.size).toBe(0)
  })

  it('returns origin-restricted CORS and no-store responses', async () => {
    const res = await handleWatchlists(req('OPTIONS'), { SPEND: fakeKv() }, `/watchlists/${TOKEN}`)
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
