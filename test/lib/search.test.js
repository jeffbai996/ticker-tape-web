import { describe, it, expect } from 'vitest'
import { filterNav } from '../../src/lib/search.js'

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
