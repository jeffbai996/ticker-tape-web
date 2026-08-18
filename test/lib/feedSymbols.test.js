import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createFeedSymbolRegistry } from '../../src/lib/feedSymbols.js'

describe('live feed symbol registry', () => {
  it('puts the most recently mounted watchlist first and releases it on navigation', () => {
    const registry = createFeedSymbolRegistry()
    const releaseMain = registry.retain(['AAPL', 'MSFT'])
    const releaseCustom = registry.retain(['NVDA', 'MSFT'])

    expect(registry.values()).toEqual(['NVDA', 'MSFT', 'AAPL', 'MSFT'])

    releaseCustom()
    expect(registry.values()).toEqual(['AAPL', 'MSFT'])
    releaseMain()
    expect(registry.values()).toEqual([])
  })

  it('keeps overlapping consumers and persistent alert symbols without duplicating them', () => {
    const registry = createFeedSymbolRegistry()
    const releaseTape = registry.retain(['AAPL', 'MSFT'])
    const releaseBoard = registry.retain(['MSFT', 'NVDA'])
    registry.persist(['ALRT', 'MSFT'])

    expect(registry.values()).toEqual(['MSFT', 'NVDA', 'AAPL', 'ALRT'])
    releaseBoard()
    expect(registry.values()).toEqual(['AAPL', 'MSFT', 'ALRT'])
    releaseTape()
    expect(registry.values()).toEqual(['ALRT', 'MSFT'])
  })

  it('wires useQuotes cleanup into active feed following', () => {
    const hooks = readFileSync('src/hooks.js', 'utf8')
    const feed = readFileSync('src/lib/feed.js', 'utf8')
    expect(hooks).toMatch(/^import \{[^}]*\bfollow\b[^}]*\} from '\.\/lib\/feed\.js'$/m)
    expect(hooks).toContain('const unfollow = follow(symbols)')
    expect(hooks).toMatch(/return \(\) => \{[\s\S]*unfollow\(\)[\s\S]*gate\.dispose\(\)/)
    expect(feed).toContain('export function follow(symbols)')
  })
})
