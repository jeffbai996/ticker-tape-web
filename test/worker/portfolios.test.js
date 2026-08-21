/** The portfolio sync route holds a real person's book behind nothing but a
 *  capability string — the validator is the only wall between the KV store
 *  and whatever anyone POSTs at it.
 */
import { describe, expect, it } from 'vitest'
import {
  handlePortfolios, portfolioStorageKey, validPortfolioCapability,
  validatePortfolioDocument,
} from '../../worker/portfolios.js'
import { capDocEnv } from './capdocHarness.js'

const TOKEN = 'a'.repeat(32)
const ORIGIN = 'https://jeffbai996.github.io'
const doc = {
  portfolios: [{
    id: 'p1', name: 'HK income', ccy: 'HKD',
    holdings: [{ symbol: '0700.HK', shares: 100, cost: 320 }, { symbol: 'AAPL', shares: 2.5 }],
  }],
  touched: { p1: 10 },
  deleted: { p2: 5 },
}

function req(method = 'GET', body, token = TOKEN) {
  return new Request('https://worker.test/portfolios', {
    method,
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('document contract', () => {
  it('accepts a well-formed multi-currency book', () => {
    expect(validatePortfolioDocument(doc)).toEqual({ ok: true })
  })

  it('refuses the shapes that would corrupt a reader', () => {
    expect(validatePortfolioDocument(null).ok).toBe(false)
    expect(validatePortfolioDocument({ ...doc, extra: 1 }).ok).toBe(false)
    expect(validatePortfolioDocument({ ...doc, portfolios: [{ ...doc.portfolios[0], ccy: 'GBP' }] }).ok).toBe(false)
    expect(validatePortfolioDocument({ ...doc, portfolios: [{ ...doc.portfolios[0], id: 'sample' }] }).ok).toBe(false)
    expect(validatePortfolioDocument({
      ...doc,
      portfolios: [{ ...doc.portfolios[0], holdings: [{ symbol: 'AAPL', shares: 0 }] }],
    }).ok).toBe(false)
    expect(validatePortfolioDocument({
      ...doc,
      portfolios: [{ ...doc.portfolios[0], holdings: [{ symbol: 'AAPL', shares: 1 }, { symbol: 'AAPL', shares: 2 }] }],
    }).ok).toBe(false)
    expect(validatePortfolioDocument({ ...doc, touched: { 'not-an-id': 1 } }).ok).toBe(false)
  })

  it('keys storage by capability and rejects junk capabilities', () => {
    expect(portfolioStorageKey(TOKEN)).toBe(`myportfolios:${TOKEN}`)
    expect(validPortfolioCapability('short')).toBe(false)
    expect(portfolioStorageKey('short')).toBe('')
  })
})

describe('the route', () => {
  it('404s a legacy path credential and serves an empty authenticated first read', async () => {
    const env = capDocEnv(TOKEN)
    const bad = await handlePortfolios(req(), env, `/portfolios/${TOKEN}`)
    expect(bad.status).toBe(404)
    const first = await handlePortfolios(req(), env, '/portfolios')
    expect(await first.json()).toEqual({ ok: true, rev: 0, data: null })
  })

  it('round-trips a push, bumps the revision, and 409s a stale writer with the winner', async () => {
    const env = capDocEnv(TOKEN)
    const path = '/portfolios'
    const put = await handlePortfolios(req('POST', { rev: 0, data: doc }), env, path)
    expect(await put.json()).toEqual({ ok: true, rev: 1 })
    const read = await handlePortfolios(req(), env, path)
    expect((await read.json()).data).toEqual(doc)
    const stale = await handlePortfolios(req('POST', { rev: 0, data: doc }), env, path)
    expect(stale.status).toBe(409)
    const out = await stale.json()
    expect(out.rev).toBe(1)
    expect(out.data).toEqual(doc)
  })

  it('refuses an invalid document instead of storing it', async () => {
    const env = capDocEnv(TOKEN)
    const resp = await handlePortfolios(
      req('POST', { rev: 0, data: { ...doc, portfolios: 'nope' } }), env, '/portfolios')
    expect(resp.status).toBe(400)
    expect(env.SPEND.rows.size).toBe(0)
  })
})
