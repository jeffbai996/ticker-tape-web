import { describe, it, expect } from 'vitest'
import {
  handleWatchlists, validWatchlistCapability, validateWatchlistDocument,
  watchlistStorageKey,
} from '../../worker/watchlists.js'
import { capDocEnv } from './capdocHarness.js'

const TOKEN = '0'.repeat(32)
const ORIGIN = 'https://jeffbai996.github.io'
const doc = {
  main: ['AAPL', 'BRK-B'],
  lists: [{ id: 'semis', name: 'Semis', symbols: ['NVDA', 'MU'] }],
  touched: { main: 10, semis: 20 },
  deleted: {},
}

function req(method = 'GET', body, token = TOKEN) {
  return new Request('https://worker.test/watchlists', {
    method,
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
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
    const env = capDocEnv(TOKEN)
    const created = await handleWatchlists(req('POST', { rev: 0, data: doc }), env, '/watchlists')
    expect(created.status).toBe(200)
    expect(await created.json()).toMatchObject({ ok: true, rev: 1 })

    const fetched = await handleWatchlists(req(), env, '/watchlists')
    expect(await fetched.json()).toEqual({ ok: true, rev: 1, data: doc })

    const other = 'fedcba9876543210fedcba9876543210'
    const denied = await handleWatchlists(req('GET', null, other), env, '/watchlists')
    expect(denied.status).toBe(401)
  })

  it('returns the current document on a stale revision', async () => {
    const env = capDocEnv(TOKEN)
    await handleWatchlists(req('POST', { rev: 0, data: doc }), env, '/watchlists')
    const stale = await handleWatchlists(req('POST', { rev: 0, data: { ...doc, main: ['TSM'] } }), env, '/watchlists')
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ ok: false, error: 'conflict', rev: 1, data: doc })
  })

  it('rejects missing credentials, legacy URL credentials, bad documents, and methods', async () => {
    const env = capDocEnv(TOKEN)
    expect((await handleWatchlists(req('GET', null, ''), env, '/watchlists')).status).toBe(401)
    expect((await handleWatchlists(req('GET', null, 'f'.repeat(32)), env, '/watchlists')).status).toBe(401)
    expect((await handleWatchlists(req(), env, `/watchlists/${TOKEN}`)).status).toBe(404)
    expect((await handleWatchlists(req('POST', { rev: 0, data: { ...doc, main: ['bad symbol'] } }), env, '/watchlists')).status).toBe(400)
    expect((await handleWatchlists(req('DELETE'), env, '/watchlists')).status).toBe(405)
    expect(env.SPEND.rows.size).toBe(0)
  })

  it('serializes competing writes so exactly one wins', async () => {
    const env = capDocEnv(TOKEN)
    await handleWatchlists(req('POST', { rev: 0, data: doc }), env, '/watchlists')
    const [a, b] = await Promise.all([
      handleWatchlists(req('POST', { rev: 1, data: { ...doc, main: ['TSM'] } }), env, '/watchlists'),
      handleWatchlists(req('POST', { rev: 1, data: { ...doc, main: ['MU'] } }), env, '/watchlists'),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    const conflict = a.status === 409 ? a : b
    expect((await conflict.json()).rev).toBe(2)
  })

  it('migrates a valid legacy KV row on first access', async () => {
    const env = capDocEnv(TOKEN)
    env.SPEND.rows.set(`watchlist:${TOKEN}`, JSON.stringify({ rev: 7, data: doc }))
    const response = await handleWatchlists(req(), env, '/watchlists')
    expect(await response.json()).toEqual({ ok: true, rev: 7, data: doc })
  })

  it('returns origin-restricted CORS and no-store responses', async () => {
    const res = await handleWatchlists(req('OPTIONS'), capDocEnv(TOKEN), '/watchlists')
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization')
  })

  it('fails closed when the server capability is not provisioned', async () => {
    const response = await handleWatchlists(req(), capDocEnv(''), '/watchlists')
    expect(response.status).toBe(503)
  })
})
