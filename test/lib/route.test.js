import { describe, it, expect } from 'vitest'
import { parseHash, hrefFor } from '../../src/lib/route.js'

describe('parseHash', () => {
  it('maps empty hash to the dashboard', () => {
    expect(parseHash('')).toEqual({ section: 'dashboard', sub: null })
    expect(parseHash('#/')).toEqual({ section: 'dashboard', sub: null })
    expect(parseHash('#')).toEqual({ section: 'dashboard', sub: null })
  })

  it('parses a top-level section', () => {
    expect(parseHash('#/markets')).toEqual({ section: 'markets', sub: null })
    expect(parseHash('#/portfolio')).toEqual({ section: 'portfolio', sub: null })
  })

  it('parses a section with a sub-tab', () => {
    expect(parseHash('#/markets/sectors')).toEqual({ section: 'markets', sub: 'sectors' })
    expect(parseHash('#/screen/correlation')).toEqual({ section: 'screen', sub: 'correlation' })
  })

  it('ignores trailing slashes', () => {
    expect(parseHash('#/markets/')).toEqual({ section: 'markets', sub: null })
  })

  it('falls back to dashboard on an unknown section', () => {
    expect(parseHash('#/notapage')).toEqual({ section: 'dashboard', sub: null })
  })

  it('drops an unknown sub-tab but keeps the section', () => {
    expect(parseHash('#/markets/bogus')).toEqual({ section: 'markets', sub: null })
  })

  it('is case-insensitive', () => {
    expect(parseHash('#/Markets/Sectors')).toEqual({ section: 'markets', sub: 'sectors' })
  })
})

describe('hrefFor', () => {
  it('builds a section href', () => {
    expect(hrefFor('markets')).toBe('#/markets')
  })

  it('builds a section + sub href', () => {
    expect(hrefFor('markets', 'sectors')).toBe('#/markets/sectors')
  })

  it('builds the dashboard href as root', () => {
    expect(hrefFor('dashboard')).toBe('#/')
  })
})
