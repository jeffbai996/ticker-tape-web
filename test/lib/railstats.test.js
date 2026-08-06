import { describe, it, expect } from 'vitest'
import { groupHeat, alertDistance, rankAlerts, rangeExtremes } from '../../src/lib/railstats.js'

const q = (pct) => ({ quote: { pct } })

describe('groupHeat', () => {
  const groups = [
    { name: 'Semis', symbols: ['NVDA', 'AVGO'] },
    { name: 'Ballast', symbols: ['SGOV', 'GLD'] },
  ]
  const quotes = { NVDA: q(4), AVGO: q(2), SGOV: q(0.01), GLD: q(-1.01) }

  it('averages each group and ranks hottest first', () => {
    const rows = groupHeat(groups, quotes)
    expect(rows.map((r) => r.name)).toEqual(['Semis', 'Ballast'])
    expect(rows[0].avg).toBeCloseTo(3)
    expect(rows[0].up).toBe(2)
    expect(rows[1].avg).toBeCloseTo(-0.5)
  })

  it('counts only symbols with a live quote', () => {
    const rows = groupHeat([{ name: 'Semis', symbols: ['NVDA', 'MU'] }], quotes)
    expect(rows[0].count).toBe(1)
    expect(rows[0].avg).toBeCloseTo(4)
  })

  it('drops groups with nothing quoted rather than printing a flat zero', () => {
    expect(groupHeat([{ name: 'Empty', symbols: ['ZZZZ'] }], quotes)).toEqual([])
    expect(groupHeat(null, quotes)).toEqual([])
  })
})

describe('alertDistance', () => {
  it('signs the gap so closer-to-firing is closer to zero from below', () => {
    expect(alertDistance({ type: 'price', operator: '>', value: 100 }, 95)).toBeCloseTo(-5)
    expect(alertDistance({ type: 'price', operator: '<', value: 100 }, 105)).toBeCloseTo(-5)
  })

  it('goes positive once the level is through', () => {
    expect(alertDistance({ type: 'price', operator: '>', value: 100 }, 110)).toBeCloseTo(10)
    expect(alertDistance({ type: 'price', operator: '<', value: 100 }, 90)).toBeCloseTo(10)
  })

  it('has no price distance for technical alerts or missing data', () => {
    expect(alertDistance({ type: 'rsi', operator: '>', value: 70 }, 95)).toBeNull()
    expect(alertDistance({ type: 'price', operator: '>', value: 100 }, null)).toBeNull()
    expect(alertDistance({ type: 'price', operator: '>', value: 0 }, 100)).toBeNull()
  })
})

describe('rankAlerts', () => {
  const alerts = [
    { id: 1, symbol: 'NVDA', type: 'price', operator: '>', value: 250 },
    { id: 2, symbol: 'AVGO', type: 'price', operator: '>', value: 400 },
    { id: 3, symbol: 'MU', type: 'price', operator: '>', value: 100, triggered: 1 },
  ]
  const prices = { NVDA: 200, AVGO: 396, MU: 101 }

  it('puts the nearest armed alert first', () => {
    expect(rankAlerts(alerts, prices).map((r) => r.alert.id)).toEqual([2, 1, 3])
  })

  it('sinks already-triggered alerts regardless of distance', () => {
    const ranked = rankAlerts(alerts, prices)
    expect(ranked[ranked.length - 1].alert.id).toBe(3)
  })

  it('survives an empty list', () => {
    expect(rankAlerts(null, prices)).toEqual([])
  })
})

describe('rangeExtremes', () => {
  const rows = [
    { symbol: 'NVDA', quote: { low: 100, high: 110, price: 109.8, pct: 3 } },
    { symbol: 'AVGO', quote: { low: 100, high: 110, price: 100.5, pct: -2 } },
    { symbol: 'MU', quote: { low: 100, high: 110, price: 105, pct: 0.2 } },
    { symbol: 'BAD', quote: { low: 100, high: 100, price: 100, pct: 0 } },
  ]

  it('reads the feed\'s dayLow/dayHigh names as well as bare low/high', () => {
    const feedRows = [{ symbol: 'NVDA', dayLow: 100, dayHigh: 110, price: 109.8, pct: 3 }]
    expect(rangeExtremes(feedRows).highs.map((h) => h.symbol)).toEqual(['NVDA'])
  })

  it('separates top-of-range from bottom-of-range names', () => {
    const { highs, lows } = rangeExtremes(rows)
    expect(highs.map((h) => h.symbol)).toEqual(['NVDA'])
    expect(lows.map((l) => l.symbol)).toEqual(['AVGO'])
  })

  it('ignores mid-range names and degenerate ranges', () => {
    const { highs, lows } = rangeExtremes(rows)
    const named = [...highs, ...lows].map((r) => r.symbol)
    expect(named).not.toContain('MU')
    expect(named).not.toContain('BAD')
  })
})
