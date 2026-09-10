import { describe, expect, it } from 'vitest'
import {
  buildMoverRows, filterMoverRows, moverVolumeRatio, rankMoverRows,
} from '../../src/lib/movers.js'

const row = (symbol, pct, volume = 100, avgVolume = 100, name = '') => ({
  symbol, name, volRatio: volume / avgVolume,
  q: { pct, volume, avgVolume, name },
})

describe('movers', () => {
  it('builds only priced rows and keeps company context', () => {
    const out = buildMoverRows(['AAA', 'MISS'], {
      AAA: { quote: { pct: 2, volume: 200, avgVolume: 100, name: 'Alpha Inc.' } },
      MISS: { quote: { pct: null } },
    })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ symbol: 'AAA', name: 'Alpha Inc.', volRatio: 2 })
  })

  it('filters by absolute move and symbol or company name', () => {
    const rows = [row('AAA', 2.1, 100, 100, 'Alpha'), row('BBB', -0.8, 100, 100, 'Beta')]
    expect(filterMoverRows(rows, { minMove: 1 })).toHaveLength(1)
    expect(filterMoverRows(rows, { query: 'beta' }).map((r) => r.symbol)).toEqual(['BBB'])
  })

  it('ranks gainers, losers, and activity in the direction the headings promise', () => {
    const rows = [row('AAA', 1, 100, 100), row('BBB', 3, 100, 200), row('CCC', -4, 300, 100)]
    expect(rankMoverRows(rows, 'gainers').map((r) => r.symbol)).toEqual(['BBB', 'AAA'])
    expect(rankMoverRows(rows, 'losers').map((r) => r.symbol)).toEqual(['CCC'])
    expect(rankMoverRows(rows, 'active').map((r) => r.symbol)).toEqual(['CCC', 'AAA', 'BBB'])
  })

  it('does not invent an activity ratio without a valid baseline', () => {
    expect(moverVolumeRatio({ q: { volume: 100, avgVolume: 0 } })).toBeNull()
    expect(moverVolumeRatio({ q: { volume: 100, avgVolume: 25 } })).toBe(4)
  })
})
