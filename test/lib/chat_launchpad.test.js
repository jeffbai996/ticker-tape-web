import { describe, expect, it } from 'vitest'

import { dynamicActions } from '../../src/lib/launchpad.js'

/**
 * Every live branch in dynamicActions keys off market activity — a print
 * today, a 3% mover, an RSI extreme. On a closed weekend none of them fire
 * and the static tail is the whole pad, which is how it came to look
 * half-built (Jeff 2026-08-09). Pin the floor.
 */
describe('launchpad quick actions', () => {
  const dead = {
    watchlist: ['AAPL', 'MSFT'],
    quotes: {},          // market shut: no pct, no tech badges
    earnDays: {},        // nothing reporting
    nextEvent: null,
    book: false,
    journal: [],
  }

  it('fills the pad even with no live market data at all', () => {
    const acts = dynamicActions(dead)
    expect(acts.length).toBe(12)
  })

  it('never repeats a prompt', () => {
    const acts = dynamicActions(dead)
    expect(new Set(acts.map((a) => a.t)).size).toBe(acts.length)
  })

  it('skips symbol prompts rather than showing a placeholder', () => {
    const acts = dynamicActions({ ...dead, watchlist: [] })
    expect(acts.every((a) => !/\{symbol\}|undefined/.test(a.t))).toBe(true)
  })
})
