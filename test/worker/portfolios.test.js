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

describe('optional per-book fields — cash, daily marks, trades', () => {
  const base = () => ({ portfolios: [{ id: 'p1', name: 'g', ccy: 'CNY', holdings: [{ symbol: '0700.HK', shares: 100 }] }], touched: {}, deleted: {} })
  const withBook = (extra) => { const d = base(); Object.assign(d.portfolios[0], extra); return d }

  it('accepts a book that carries cash, snapshots and txns', () => {
    expect(validatePortfolioDocument(withBook({
      cash: [{ ccy: 'HKD', amount: -1200.5 }],
      snapshots: [{ d: '2026-08-22', v: 54128742.11, c: 'CNY' }],
      txns: [{ id: 't1', d: '2026-08-20', sym: '0700.HK', side: 'buy', qty: 100, px: 457, fee: 12.5, ccy: 'HKD', affectsCash: true }],
      cashTxns: [
        { id: 'c1', kind: 'opening', ccy: 'HKD', amount: 50_000 },
        { id: 'c2', d: '2026-08-22', kind: 'deposit', ccy: 'HKD', amount: 1_000, note: 'transfer', bookAmount: 128.2, bookCcy: 'CNY' },
      ],
    })).ok).toBe(true)
  })

  it('still accepts the older shape without them', () => {
    expect(validatePortfolioDocument(base()).ok).toBe(true)
  })

  it('rejects malformed extras rather than storing them', () => {
    expect(validatePortfolioDocument(withBook({ snapshots: [{ d: 'yesterday', v: 1, c: 'CNY' }] })).ok).toBe(false)
    expect(validatePortfolioDocument(withBook({ cash: [{ ccy: 'EUR', amount: 1 }] })).ok).toBe(false)
    expect(validatePortfolioDocument(withBook({ cash: [{ ccy: 'HKD', amount: 1 }, { ccy: 'HKD', amount: 2 }] })).ok).toBe(false)
    expect(validatePortfolioDocument(withBook({ txns: [{ id: 't1', d: '2026-08-20', sym: '0700.HK', side: 'short', qty: 1, px: 1 }] })).ok).toBe(false)
    expect(validatePortfolioDocument(withBook({ txns: [{ id: 't1', d: '2026-08-20', sym: '0700.HK', side: 'buy', qty: 0, px: 1 }] })).ok).toBe(false)
    expect(validatePortfolioDocument(withBook({ cashTxns: [{ id: 'c1', d: 'bad', kind: 'deposit', ccy: 'HKD', amount: 1 }] })).ok).toBe(false)
    expect(validatePortfolioDocument(withBook({ cashTxns: [{ id: 'c1', d: '2026-08-22', kind: 'withdrawal', ccy: 'HKD', amount: 1 }] })).ok).toBe(false)
    expect(validatePortfolioDocument(withBook({ bogus: 1 })).ok).toBe(false)
  })
})
