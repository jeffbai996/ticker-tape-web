import { beforeEach, describe, expect, it } from 'vitest'
import {
  addWatchlistSymbol, createWatchlist, getWatchlistById, loadWatchlists,
  onWatchlistsChange, removeWatchlist, removeWatchlistSymbol, renameWatchlist,
} from '../../src/lib/watchlists.js'

beforeEach(() => localStorage.clear())

describe('named watchlists', () => {
  it('creates a clean empty dashboard and persists selected symbols', () => {
    const list = createWatchlist('Semis radar')
    expect(list).toMatchObject({ id: 'semis-radar', name: 'Semis radar', symbols: [] })
    expect(addWatchlistSymbol(list.id, 'sndk')).toEqual(['SNDK'])
    expect(addWatchlistSymbol(list.id, 'NVDA')).toEqual(['SNDK', 'NVDA'])
    expect(getWatchlistById(list.id).symbols).toEqual(['SNDK', 'NVDA'])
    expect(removeWatchlistSymbol(list.id, 'sndk')).toEqual(['NVDA'])
  })

  it('uses stable unique ids and rejects duplicate names', () => {
    expect(createWatchlist('AI / Infra').id).toBe('ai-infra')
    expect(createWatchlist('AI / INFRA')).toBeNull()
    expect(createWatchlist('   ')).toBeNull()
  })

  it('renames, removes, and notifies without changing the route id', () => {
    const list = createWatchlist('Ideas', ['aapl'])
    let seen = null
    const off = onWatchlistsChange((items) => { seen = items })
    expect(renameWatchlist(list.id, 'Earnings')).toMatchObject({ id: list.id, name: 'Earnings' })
    expect(seen[0].name).toBe('Earnings')
    expect(removeWatchlist(list.id)).toBe(true)
    expect(loadWatchlists()).toEqual([])
    off()
  })
})
