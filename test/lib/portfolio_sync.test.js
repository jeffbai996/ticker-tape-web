/** Portfolio cloud sync (Jeff 2026-08-20: stepdad's book must survive an
 *  iOS localStorage eviction and follow him across devices).
 *
 *  One sync code covers watchlists AND portfolios, but each document has its
 *  own endpoint and its own merge — a stale client that only knows one
 *  document can never stomp the other.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadPortfolioSyncMeta, markPortfolioDeleted, mergePortfolioDocs,
  savePortfolioSyncMeta, touchPortfolio,
} from '../../src/lib/portfolioSync.js'

beforeEach(() => localStorage.clear())

const book = (id, name, holdings = []) => ({ id, name, ccy: 'USD', holdings })

describe('mergePortfolioDocs — per-portfolio, newest touch wins', () => {
  it('keeps local when there is no remote yet', () => {
    const local = { portfolios: [book('p1', 'Mine')], touched: { p1: 5 }, deleted: {} }
    expect(mergePortfolioDocs(local, null)).toEqual({ doc: local, changedLocal: false })
  })

  it('adopts remote portfolios this device has never seen', () => {
    const local = { portfolios: [book('p1', 'Here')], touched: { p1: 5 }, deleted: {} }
    const remote = { portfolios: [book('p2', 'Phone')], touched: { p2: 9 }, deleted: {} }
    const { doc, changedLocal } = mergePortfolioDocs(local, remote)
    expect(doc.portfolios.map((p) => p.id).sort()).toEqual(['p1', 'p2'])
    expect(changedLocal).toBe(true)
  })

  it('the newer edit wins the whole portfolio, not a field-mash', () => {
    const local = { portfolios: [book('p1', 'Old name', [{ symbol: 'AAPL', shares: 5 }])],
      touched: { p1: 10 }, deleted: {} }
    const remote = { portfolios: [book('p1', 'New name', [{ symbol: 'AAPL', shares: 8 }])],
      touched: { p1: 20 }, deleted: {} }
    const { doc, changedLocal } = mergePortfolioDocs(local, remote)
    expect(doc.portfolios).toEqual([book('p1', 'New name', [{ symbol: 'AAPL', shares: 8 }])])
    expect(changedLocal).toBe(true)
  })

  it('a deletion beats an edit only when the deletion is newer', () => {
    const alive = mergePortfolioDocs(
      { portfolios: [book('p1', 'Kept')], touched: { p1: 30 }, deleted: {} },
      { portfolios: [], touched: {}, deleted: { p1: 20 } })
    expect(alive.doc.portfolios).toHaveLength(1)     // edit is newer — survives
    const gone = mergePortfolioDocs(
      { portfolios: [book('p1', 'Doomed')], touched: { p1: 10 }, deleted: {} },
      { portfolios: [], touched: {}, deleted: { p1: 40 } })
    expect(gone.doc.portfolios).toEqual([])
    expect(gone.changedLocal).toBe(true)             // local copy must go
  })

  it('identical docs merge to no local change', () => {
    const doc = { portfolios: [book('p1', 'Same')], touched: { p1: 7 }, deleted: {} }
    const { changedLocal } = mergePortfolioDocs(doc, { ...doc })
    expect(changedLocal).toBe(false)
  })
})

describe('sync meta', () => {
  it('round-trips, and starts clean on a fresh or corrupt device', () => {
    expect(loadPortfolioSyncMeta()).toEqual({ rev: 0, touched: {}, deleted: {} })
    savePortfolioSyncMeta({ rev: 3, touched: { p1: 9 }, deleted: {} })
    expect(loadPortfolioSyncMeta().rev).toBe(3)
    localStorage.setItem('my_portfolios_sync_meta_v1', '{broken')
    expect(loadPortfolioSyncMeta()).toEqual({ rev: 0, touched: {}, deleted: {} })
  })

  it('a deletion tombstone clears the touch so the edit cannot resurrect', () => {
    let meta = touchPortfolio({ rev: 0, touched: {}, deleted: {} }, 'p1', 5)
    meta = markPortfolioDeleted(meta, 'p1', 9)
    expect(meta.touched.p1).toBeUndefined()
    expect(meta.deleted.p1).toBe(9)
  })
})
