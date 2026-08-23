/** Gordon's book is a real person's money behind one Durable Object row.
 *  Two guards keep a bad push from erasing it: every accepted write is kept
 *  in a short revision ring (restorable), and a write that shrinks the book
 *  is refused unless the client declares it was the person deleting.
 */
import { describe, expect, it } from 'vitest'
import { handlePortfolios } from '../../worker/portfolios.js'
import { HISTORY_KEEP, shrinkReason } from '../../worker/shrink.js'
import { capDocEnv } from './capdocHarness.js'

const TOKEN = 'b'.repeat(32)
const ORIGIN = 'https://jeffbai996.github.io'
const book = (n, holdings = 3) => ({
  portfolios: Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`, name: `book ${i + 1}`, ccy: 'CNY',
    holdings: Array.from({ length: holdings }, (_, j) => ({ symbol: `S${i}${j}`, shares: 1 })),
  })),
  touched: {}, deleted: {},
})

function req(path, method = 'GET', body, headers = {}) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
const call = (env, path, method, body, headers) => handlePortfolios(req(path, method, body, headers), env, path)
const push = (env, rev, data, headers) => call(env, '/portfolios', 'POST', { rev, data }, headers)

describe('shrinkReason', () => {
  it('never flags the first write or a same-size edit', () => {
    expect(shrinkReason(null, book(2))).toBe('')
    expect(shrinkReason(book(2), book(2))).toBe('')
    expect(shrinkReason(book(2), book(3))).toBe('')
  })
  it('flags fewer portfolios or a >30% drop in holdings', () => {
    expect(shrinkReason(book(2), book(1))).toBe('fewer portfolios')
    expect(shrinkReason(book(1, 10), book(1, 6))).toBe('fewer holdings')
    expect(shrinkReason(book(1, 10), book(1, 7))).toBe('')
    expect(shrinkReason(book(1, 1), book(1, 0))).toBe('fewer holdings')
  })
})

describe('revision ring', () => {
  it('keeps the last HISTORY_KEEP revisions and lists them newest-first with counts', async () => {
    const env = capDocEnv(TOKEN)
    let rev = 0
    for (let i = 1; i <= HISTORY_KEEP + 5; i++) {
      const r = await push(env, rev, book(1, i))
      expect(r.status).toBe(200)
      rev = (await r.json()).rev
    }
    const hist = await call(env, '/portfolios/history')
    expect(hist.status).toBe(200)
    const out = await hist.json()
    expect(out.ok).toBe(true)
    expect(out.revisions.length).toBe(HISTORY_KEEP)
    expect(out.revisions[0]).toMatchObject({ rev: HISTORY_KEEP + 5, portfolios: 1, holdings: HISTORY_KEEP + 5 })
    expect(out.revisions.at(-1).rev).toBe(6)
    expect(typeof out.revisions[0].at).toBe('number')
  })

  it('files a pre-ring head once so the first history entry is the book before the guard', async () => {
    const env = capDocEnv(TOKEN)
    env.SPEND.rows.set(`myportfolios:${TOKEN}`, JSON.stringify({ rev: 539, data: book(5, 14) }))
    const hist = await (await call(env, '/portfolios/history')).json()
    expect(hist.revisions).toEqual([{ rev: 539, at: 0, portfolios: 5, holdings: 70 }])
    const head = await (await call(env, '/portfolios')).json()
    expect(head.rev).toBe(539)
  })

  it('restore rolls an old revision forward as a new head, 404s an evicted one', async () => {
    const env = capDocEnv(TOKEN)
    await push(env, 0, book(2))
    await push(env, 1, book(3))
    const r = await call(env, '/portfolios/restore', 'POST', { rev: 1 })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ ok: true, rev: 3 })
    const head = await (await call(env, '/portfolios')).json()
    expect(head.rev).toBe(3)
    expect(head.data).toEqual(book(2))
    expect((await call(env, '/portfolios/restore', 'POST', { rev: 99 })).status).toBe(404)
    expect((await call(env, '/portfolios/restore', 'POST', { rev: 'x' })).status).toBe(400)
  })
})

describe('shrink guard', () => {
  it('refuses a shrinking push without a delete intent, and names why', async () => {
    const env = capDocEnv(TOKEN)
    await push(env, 0, book(2))
    const r = await push(env, 1, book(1))
    expect(r.status).toBe(409)
    expect(await r.json()).toMatchObject({ ok: false, error: 'shrink', reason: 'fewer portfolios', rev: 1 })
    const head = await (await call(env, '/portfolios')).json()
    expect(head.data).toEqual(book(2))
  })
  it('accepts the same push when the person meant it', async () => {
    const env = capDocEnv(TOKEN)
    await push(env, 0, book(2))
    const r = await push(env, 1, book(1), { 'X-Capdoc-Intent': 'delete' })
    expect(await r.json()).toEqual({ ok: true, rev: 2 })
  })
  it('still applies the revision check before the guard', async () => {
    const env = capDocEnv(TOKEN)
    await push(env, 0, book(2))
    const r = await push(env, 0, book(1))
    expect((await r.json()).error).toBe('conflict')
  })
})
