import { describe, it, expect, beforeEach } from 'vitest'
import { filterNav, searchLocal } from '../../src/lib/search.js'

describe('searchLocal', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('tape-recent-syms', JSON.stringify(['MU', 'AVGO']))
    localStorage.setItem('named_watchlists_v1', JSON.stringify([
      { id: 'memory', name: 'Memory', symbols: ['MU', 'WDC'] },
    ]))
  })

  it('returns nothing for an empty query', () => {
    expect(searchLocal('  ')).toEqual([])
  })

  it('matches recents first and dedupes across sources', () => {
    const out = searchLocal('mu')
    expect(out[0]).toMatchObject({ kind: 'symbol', symbol: 'MU', source: 'recent' })
    expect(out.filter((e) => e.symbol === 'MU')).toHaveLength(1)
  })

  it('matches named watchlists by name and their members', () => {
    const out = searchLocal('mem')
    expect(out.some((e) => e.kind === 'list' && e.href === '#/watchlists/memory')).toBe(true)
  })

  it('pulls symbols out of named lists', () => {
    expect(searchLocal('wdc')).toEqual([
      expect.objectContaining({ symbol: 'WDC', source: 'list', href: '#/research/wdc' }),
    ])
  })
})

describe('filterNav', () => {
  it('returns all top-level sections for an empty query', () => {
    const out = filterNav('')
    expect(out.length).toBeGreaterThanOrEqual(6)
    expect(out.every((e) => e.kind === 'nav')).toBe(true)
    expect(out[0].href.startsWith('#/')).toBe(true)
  })

  it('matches section labels case-insensitively', () => {
    const out = filterNav('MARK')
    expect(out.some((e) => e.label === 'Markets')).toBe(true)
    expect(out.some((e) => e.label === 'Dashboard')).toBe(false)
  })

  it('matches sub-tabs with a combined label and href', () => {
    const out = filterNav('heat')
    const heat = out.find((e) => e.label === 'Markets / Heatmap')
    expect(heat).toBeTruthy()
    expect(heat.href).toBe('#/markets/heatmap')
  })

  it('returns empty for a no-match query', () => {
    expect(filterNav('zzzznope')).toEqual([])
  })
})
