import { describe, expect, it } from 'vitest'

import {
  LANES, PAD_SIZE, activeLanes, canRefresh, dynamicActions, visibleActions,
} from '../../src/lib/launchpad.js'

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
    expect(visibleActions(dynamicActions(dead)).length).toBe(PAD_SIZE)
  })

  it('keeps more prompts in the pool than fit on the pad, so refresh has somewhere to go', () => {
    const pool = dynamicActions(dead)
    expect(pool.length).toBeGreaterThan(PAD_SIZE)
    expect(canRefresh(pool)).toBe(true)
  })

  it('never repeats a prompt', () => {
    const pool = dynamicActions(dead)
    expect(new Set(pool.map((a) => a.t)).size).toBe(pool.length)
  })

  it('skips symbol prompts rather than showing a placeholder', () => {
    const pool = dynamicActions({ ...dead, watchlist: [] })
    expect(pool.every((a) => !/\{symbol\}|undefined/.test(a.t))).toBe(true)
  })

  it('tags every prompt with a known lane', () => {
    const known = new Set(LANES.map((l) => l.k))
    for (const a of dynamicActions(dead)) expect(known.has(a.k)).toBe(true)
  })
})

describe('pad windowing', () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ t: `q${i}`, k: i % 2 ? 'mkt' : 'idea' }))

  it('shows a different set after a refresh', () => {
    const first = visibleActions(pool, { page: 0 }).map((a) => a.t)
    const second = visibleActions(pool, { page: 1 }).map((a) => a.t)
    expect(second).not.toEqual(first)
  })

  it('wraps rather than running off the end', () => {
    const pages = Math.ceil(pool.length / PAD_SIZE)
    expect(visibleActions(pool, { page: pages * pool.length }).length).toBe(PAD_SIZE)
    expect(visibleActions(pool, { page: 0 })).toEqual(visibleActions(pool, { page: pool.length }))
  })

  it('filters to one lane', () => {
    const only = visibleActions(pool, { lane: 'idea' })
    expect(only.length).toBeGreaterThan(0)
    expect(only.every((a) => a.k === 'idea')).toBe(true)
  })

  it('returns everything when a lane has fewer than a padful', () => {
    const thin = [{ t: 'a', k: 'book' }, { t: 'b', k: 'book' }]
    expect(visibleActions(thin, { lane: 'book' }).length).toBe(2)
    expect(canRefresh(thin, { lane: 'book' })).toBe(false)
  })

  it('only offers lanes that are actually populated', () => {
    const lanes = activeLanes([{ t: 'a', k: 'book' }, { t: 'b', k: 'mkt' }])
    expect(lanes.map((l) => l.k)).toEqual(['mkt', 'book'])
  })
})
