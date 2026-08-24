import { beforeEach, describe, expect, it } from 'vitest'
import {
  loadSidebarWatchlistId, saveSidebarWatchlistId,
} from '../../src/lib/sidebarWatchlist.js'

const lists = [{ id: 'earnings', name: 'Earnings' }, { id: 'macro', name: 'Macro' }]

beforeEach(() => localStorage.clear())

describe('sidebar watchlist preference', () => {
  it('uses Default until a reader selects a named list', () => {
    expect(loadSidebarWatchlistId(lists)).toBe('main')

    saveSidebarWatchlistId('earnings')
    expect(loadSidebarWatchlistId(lists)).toBe('earnings')
  })

  it('falls back to Default when the selected list no longer exists', () => {
    saveSidebarWatchlistId('removed-list')

    expect(loadSidebarWatchlistId(lists)).toBe('main')
  })
})
