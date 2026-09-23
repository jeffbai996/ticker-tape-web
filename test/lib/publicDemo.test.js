import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('public demo isolation', () => {
  it('ignores old family-origin portfolios and watchlists, even after the old purge marker', async () => {
    vi.stubEnv('VITE_PUBLIC_DEMO', '1')
    vi.resetModules()
    localStorage.setItem('ttw_family_residue_purged_v1', '1')
    localStorage.setItem('my_portfolios_v1', JSON.stringify([
      { id: 'p1', name: 'Gang', ccy: 'USD', holdings: [{ symbol: 'AAPL', shares: 10, cost: 100 }] },
    ]))
    localStorage.setItem('named_watchlists_v1', JSON.stringify([
      { id: 'family', name: 'Family list', symbols: ['AAPL'] },
    ]))
    localStorage.setItem('watchlist_v1', JSON.stringify(['AAPL']))

    const { loadPortfolios } = await import('../../src/lib/myPortfolios.js')
    const { loadWatchlists, createWatchlist } = await import('../../src/lib/watchlists.js')
    const { getWatchlist } = await import('../../src/lib/watchlist.js')
    expect(loadPortfolios().map((p) => p.name)).toEqual(['Sample portfolio'])
    expect(loadWatchlists().map((list) => list.name)).toEqual([
      'Large caps', 'Semiconductors', 'Markets & ETFs',
    ])
    expect(getWatchlist().length).toBeGreaterThan(1)
    expect(localStorage.getItem('my_portfolios_v1')).toContain('Gang')

    createWatchlist('Custom', ['MSFT'])
    expect(localStorage.getItem('public_demo_named_watchlists_v1')).toContain('Custom')
    expect(localStorage.getItem('named_watchlists_v1')).toContain('Family list')
  })

  it('does not reseed after a visitor deliberately empties their public lists', async () => {
    vi.stubEnv('VITE_PUBLIC_DEMO', '1')
    vi.resetModules()
    localStorage.setItem('public_demo_named_watchlists_v1', '[]')
    localStorage.setItem('public_demo_my_portfolios_v1', '[]')
    const { loadPortfolios } = await import('../../src/lib/myPortfolios.js')
    const { loadWatchlists } = await import('../../src/lib/watchlists.js')
    expect(loadPortfolios()).toEqual([])
    expect(loadWatchlists()).toEqual([])
  })
})
