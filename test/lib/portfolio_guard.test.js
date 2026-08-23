/** The client half of the drop guard (Jeff 2026-08-23). A delete the person
 *  asked for declares itself, so the worker lets the book shrink once; a
 *  shrink no one asked for is refused upstream and the device adopts the
 *  server's copy instead of retrying the wipe. Deleted books sit in a local
 *  trash for 30 days.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPortfolio, deletePortfolio, loadPortfolios, loadTrash, purgeTrash,
  removeHolding, restoreFromTrash, setHolding, TRASH_DAYS,
} from '../../src/lib/myPortfolios.js'
import { declareDeleteIntent, hasDeleteIntent, takeDeleteIntent } from '../../src/lib/syncIntent.js'
import { applyPushOutcome } from '../../src/lib/portfolioSync.js'

beforeEach(() => localStorage.clear())

describe('delete intent', () => {
  it('is declared by the two destructive user actions and nothing else', () => {
    const p = createPortfolio('Gordon', 'CNY')
    setHolding(p.id, '0700.HK', 100)
    expect(hasDeleteIntent()).toBe(false)
    removeHolding(p.id, '0700.HK')
    expect(hasDeleteIntent()).toBe(true)
    takeDeleteIntent()
    expect(hasDeleteIntent()).toBe(false)
    deletePortfolio(p.id)
    expect(hasDeleteIntent()).toBe(true)
  })
  it('survives a reload until a push consumes it', () => {
    declareDeleteIntent()
    expect(localStorage.getItem('my_portfolios_intent_v1')).toBeTruthy()
    expect(takeDeleteIntent()).toBe(true)
    expect(takeDeleteIntent()).toBe(false)
  })
})

describe('trash', () => {
  it('a deleted book goes to the trash and can be restored whole', () => {
    const p = createPortfolio('Gordon', 'CNY')
    setHolding(p.id, '0700.HK', 100, 320)
    deletePortfolio(p.id)
    expect(loadPortfolios()).toEqual([])
    expect(loadTrash().map((t) => t.portfolio.id)).toEqual([p.id])
    expect(restoreFromTrash(p.id)).toMatchObject({ id: p.id, holdings: [{ symbol: '0700.HK', shares: 100, cost: 320 }] })
    expect(loadPortfolios().map((x) => x.id)).toEqual([p.id])
    expect(loadTrash()).toEqual([])
  })
  it('purges entries older than TRASH_DAYS and keeps the rest', () => {
    const p = createPortfolio('Old', 'USD')
    deletePortfolio(p.id)
    const q = createPortfolio('New', 'USD')
    deletePortfolio(q.id)
    const now = Date.now()
    localStorage.setItem('my_portfolios_trash_v1', JSON.stringify(
      loadTrash().map((t) => (t.portfolio.id === p.id ? { ...t, at: now - (TRASH_DAYS + 1) * 86_400_000 } : t))))
    purgeTrash(now)
    expect(loadTrash().map((t) => t.portfolio.id)).toEqual([q.id])
  })
})

describe('a refused shrink', () => {
  it('adopts the server copy and reports blocked, rather than retrying the wipe', () => {
    const remote = { portfolios: [{ id: 'p1', name: 'Gordon', ccy: 'CNY', holdings: [{ symbol: '0700.HK', shares: 100 }] }], touched: { p1: 1 }, deleted: {} }
    const out = applyPushOutcome({ status: 409, out: { ok: false, error: 'shrink', reason: 'fewer portfolios', rev: 7, data: remote } })
    expect(out).toEqual({ blocked: 'fewer portfolios', rev: 7 })
    expect(loadPortfolios().map((x) => x.id)).toEqual(['p1'])
  })
  it('leaves a plain conflict to the merge loop', () => {
    const out = applyPushOutcome({ status: 409, out: { ok: false, error: 'conflict', rev: 3, data: null } })
    expect(out).toEqual({ conflict: true, doc: null, rev: 3 })
  })
})
