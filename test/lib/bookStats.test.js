/** Analytics for a hand-built book (Jeff 2026-08-21: "add more analytics to
 *  portfolio"). Everything here derives from the rows `portfolioValues`
 *  already produced — no second pass over quotes, no extra fetch — so a card
 *  can never disagree with the table above it.
 */
import { describe, expect, it } from 'vitest'
import {
  breadth, cashSplit, concentration, dayContribution, sectorSplit, unrealizedStats, venueSplit,
} from '../../src/lib/bookStats.js'

// a small book: two winners, one loser, one unpriced, one cash account
const rows = [
  { kind: 'equity', symbol: 'AAPL', valueDisplay: 5000, weightPct: 50, dayPnlDisplay: 100, dayPct: 2, unrealDisplay: 1000 },
  { kind: 'equity', symbol: 'MSFT', valueDisplay: 3000, weightPct: 30, dayPnlDisplay: 30, dayPct: 1, unrealDisplay: -300 },
  { kind: 'equity', symbol: 'TSLA', valueDisplay: 1000, weightPct: 10, dayPnlDisplay: -50, dayPct: -4.8, unrealDisplay: null },
  { kind: 'equity', symbol: 'DEAD', valueDisplay: null, weightPct: null, dayPnlDisplay: null, dayPct: null, unrealDisplay: null },
  { kind: 'cash', ccy: 'USD', symbol: 'CASH.USD', valueDisplay: 1000, weightPct: 10, dayPnlDisplay: null, dayPct: null, unrealDisplay: null },
]

describe('concentration — how much of the book is one bet', () => {
  it('reports the top slices and an effective position count', () => {
    const c = concentration(rows)
    // renormalised across POSITIONS, not the whole book: 5000 of the 9000
    // actually at risk, not of the 10000 that includes the cash account —
    // otherwise a book half in cash reads as half as concentrated as it is
    expect(c.top1).toBeCloseTo(5000 / 9000 * 100)
    expect(c.top3).toBeCloseTo(100)     // only three priced positions exist
    expect(c.top5).toBeCloseTo(100)
    // HHI over the equity weights renormalised to 100: 55.6² + 33.3² + 11.1²
    expect(c.hhi).toBeGreaterThan(4000)
    expect(c.effectiveN).toBeCloseTo(1e4 / c.hhi, 6)
    expect(c.count).toBe(3)
  })

  it('is empty rather than wrong when nothing is priced', () => {
    expect(concentration([{ kind: 'equity', valueDisplay: null }])).toEqual(
      { top1: null, top3: null, top5: null, hhi: null, effectiveN: null, count: 0 })
  })
})

describe('breadth — how many are up, and the two ends of the day', () => {
  it('counts direction and names the extremes', () => {
    const b = breadth(rows)
    expect(b).toMatchObject({ up: 2, down: 1, flat: 0 })
    expect(b.best.symbol).toBe('AAPL')
    expect(b.worst.symbol).toBe('TSLA')
  })

  it('treats an exactly flat print as flat, not as a winner', () => {
    const b = breadth([{ kind: 'equity', symbol: 'X', valueDisplay: 1, dayPct: 0, dayPnlDisplay: 0 }])
    expect(b).toMatchObject({ up: 0, down: 0, flat: 1 })
  })
})

describe('unrealizedStats — the book against what it cost', () => {
  it('derives cost basis from value minus unrealized, and returns a percent', () => {
    const u = unrealizedStats(rows)
    // AAPL cost 5000-1000=4000, MSFT 3000+300=3300 → 7300 basis, +700 open
    expect(u.costBasis).toBeCloseTo(7300)
    expect(u.pnl).toBeCloseTo(700)
    expect(u.pct).toBeCloseTo((700 / 7300) * 100)
    expect(u.best.symbol).toBe('AAPL')
    expect(u.worst.symbol).toBe('MSFT')
    expect(u.covered).toBe(2)          // TSLA has no cost basis
  })

  it('says nothing rather than zero when no position carries a cost', () => {
    expect(unrealizedStats([rows[2]])).toMatchObject({ costBasis: null, pnl: null, pct: null, covered: 0 })
  })
})

describe('dayContribution — who actually moved the book today', () => {
  it('shares out the day P&L, signed, biggest mover first', () => {
    const d = dayContribution(rows)
    expect(d.map((r) => r.symbol)).toEqual(['AAPL', 'TSLA', 'MSFT'])
    expect(d[0].sharePct).toBeCloseTo(100 * (100 / 180))   // |100| of 180 gross
    expect(d.find((r) => r.symbol === 'TSLA').pnl).toBe(-50)
  })

  it('is empty when no row has a day number', () => {
    expect(dayContribution([{ kind: 'equity', symbol: 'X', valueDisplay: 1 }])).toEqual([])
  })
})

describe('cashSplit — how much of the book is not invested', () => {
  it('separates cash from positions', () => {
    const c = cashSplit(rows)
    expect(c).toMatchObject({ cash: 1000, invested: 9000, total: 10000 })
    expect(c.cashPct).toBeCloseTo(10)
  })

  it('reports no cash rather than a divide by zero on an empty book', () => {
    expect(cashSplit([])).toEqual({ cash: 0, invested: 0, total: 0, cashPct: null })
  })
})

describe('venueSplit — where the book is actually listed', () => {
  it('groups by listing suffix, biggest first, with cash on its own line', () => {
    const v = venueSplit([
      { kind: 'equity', symbol: '2628.HK', valueDisplay: 5000 },
      { kind: 'equity', symbol: '0700.HK', valueDisplay: 2000 },
      { kind: 'equity', symbol: '600489.SS', valueDisplay: 2000 },
      { kind: 'equity', symbol: 'AAPL', valueDisplay: 500 },
      { kind: 'equity', symbol: 'RY.TO', valueDisplay: 500 },
      { kind: 'cash', symbol: 'CASH.HKD', valueDisplay: 1000 },
    ])
    expect(v.map((x) => x.name)).toEqual(
      ['Hong Kong', 'Shanghai', 'Cash', 'United States', 'Toronto'])
    expect(v[0].pct).toBeCloseTo(7000 / 11000 * 100)
  })

  it('falls back to the raw suffix rather than hiding an unknown venue', () => {
    const v = venueSplit([{ kind: 'equity', symbol: 'ABC.XYZ', valueDisplay: 1 }])
    expect(v[0].name).toBe('XYZ')
  })
})

describe('sectorSplit — what the buckets can and cannot say about a book', () => {
  const buckets = [{ name: 'Tech', symbols: ['AAPL', 'MSFT'] }, { name: 'Autos', symbols: ['TSLA'] }]

  it('files every priced position, cash on its own line, biggest first', () => {
    const s = sectorSplit(rows, buckets)
    expect(s.entries).toEqual([['Tech', 8000], ['Autos', 1000], ['Cash', 1000]])
    expect(s.total).toBe(10000)
    expect(s.unmappedShare).toBe(0)
  })

  it('reports the invested share no bucket claims — a HK/mainland book is all Other', () => {
    const hk = [
      { kind: 'equity', symbol: '0700.HK', valueDisplay: 6000 },
      { kind: 'equity', symbol: '2628.HK', valueDisplay: 3000 },
      { kind: 'equity', symbol: 'AAPL', valueDisplay: 1000 },
      { kind: 'cash', ccy: 'HKD', symbol: 'CASH.HKD', valueDisplay: 5000 },
    ]
    const s = sectorSplit(hk, buckets)
    expect(s.entries[0]).toEqual(['Other', 9000])
    // cash is not "invested": 9000 of the 10000 at risk is unmapped, not of 15000
    expect(s.unmappedShare).toBeCloseTo(0.9)
  })

  it('is empty rather than wrong with nothing priced or no buckets', () => {
    expect(sectorSplit([{ kind: 'equity', symbol: 'X', valueDisplay: null }], buckets))
      .toEqual({ entries: [], total: 0, unmappedShare: 0 })
    expect(sectorSplit(rows).unmappedShare).toBe(1)
  })
})
