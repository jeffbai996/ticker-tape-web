import { describe, it, expect } from 'vitest'
import { parseEarningsHistory, matchReportDate, reactionAfter, earningsSummary, peersOf, parseCalendarRows, mergeQuarters } from '../../src/lib/earnings.js'

const DAY = 86_400_000

function q(raw) {
  return { raw }
}

describe('parseEarningsHistory', () => {
  it('extracts raw values and sorts newest first', () => {
    const result = {
      earningsHistory: {
        history: [
          { quarter: q(1700000000), epsEstimate: q(1.0), epsActual: q(1.1), surprisePercent: q(0.1) },
          { quarter: q(1710000000), epsEstimate: q(2.0), epsActual: q(1.8), surprisePercent: q(-0.1) },
        ],
      },
    }
    const out = parseEarningsHistory(result)
    expect(out).toHaveLength(2)
    expect(out[0].quarter).toBe(1710000000 * 1000)   // epoch ms, newest first
    expect(out[0].epsActual).toBeCloseTo(1.8)
    expect(out[0].surprisePct).toBeCloseTo(-0.1)     // kept as a fraction
    expect(out[1].epsEstimate).toBeCloseTo(1.0)
  })

  it('drops quarters without a reported EPS', () => {
    const result = {
      earningsHistory: {
        history: [
          { quarter: q(1700000000), epsEstimate: q(1.0), epsActual: {}, surprisePercent: {} },
          { quarter: q(1710000000), epsEstimate: q(2.0), epsActual: q(2.2), surprisePercent: q(0.1) },
        ],
      },
    }
    expect(parseEarningsHistory(result)).toHaveLength(1)
  })

  it('returns empty for missing module', () => {
    expect(parseEarningsHistory({})).toEqual([])
    expect(parseEarningsHistory(null)).toEqual([])
  })
})

describe('matchReportDate', () => {
  const qEnd = Date.UTC(2026, 2, 31) // 2026-03-31

  it('picks the first report date within the post-quarter window', () => {
    const dates = [qEnd + 100 * DAY, qEnd + 30 * DAY, qEnd - 10 * DAY]
    expect(matchReportDate(qEnd, dates)).toBe(qEnd + 30 * DAY)
  })

  it('rejects dates before quarter end or past the 75-day window', () => {
    expect(matchReportDate(qEnd, [qEnd - DAY])).toBeNull()
    expect(matchReportDate(qEnd, [qEnd + 80 * DAY])).toBeNull()
    expect(matchReportDate(qEnd, [])).toBeNull()
  })
})

describe('reactionAfter', () => {
  // bars use unix seconds like the chart feed
  const bars = [
    { time: Date.UTC(2026, 0, 26) / 1000, close: 100 },
    { time: Date.UTC(2026, 0, 27) / 1000, close: 102 },  // report day (AMC)
    { time: Date.UTC(2026, 0, 28) / 1000, close: 110 },  // next session
  ]

  it('measures close on report day to first close after', () => {
    const report = Date.UTC(2026, 0, 27, 21, 30) // after the close that day
    expect(reactionAfter(bars, report)).toBeCloseTo((110 - 102) / 102 * 100)
  })

  it('returns null when there is no bar after the report', () => {
    expect(reactionAfter(bars, Date.UTC(2026, 0, 28, 21, 0))).toBeNull()
  })

  it('returns null on empty or missing input', () => {
    expect(reactionAfter([], Date.UTC(2026, 0, 27))).toBeNull()
    expect(reactionAfter(null, Date.UTC(2026, 0, 27))).toBeNull()
  })
})

describe('earningsSummary', () => {
  it('computes beats, streak, and averages (newest first)', () => {
    const events = [
      { surprisePct: 0.05, priceMove: 4 },
      { surprisePct: 0.10, priceMove: -2 },
      { surprisePct: -0.02, priceMove: 6 },
      { surprisePct: 0.03, priceMove: null },
    ]
    const s = earningsSummary(events)
    expect(s.total).toBe(4)
    expect(s.beats).toBe(3)
    expect(s.beatRate).toBeCloseTo(0.75)
    expect(s.beatStreak).toBe(2)                        // streak broken by the miss
    expect(s.avgSurprise).toBeCloseTo((0.05 + 0.1 - 0.02 + 0.03) / 4)
    expect(s.avgMove).toBeCloseTo((4 - 2 + 6) / 3)      // null moves excluded
  })

  it('handles events without surprise data', () => {
    const s = earningsSummary([{ surprisePct: null, priceMove: null }])
    expect(s.total).toBe(0)
    expect(s.beatRate).toBeNull()
    expect(s.avgSurprise).toBeNull()
    expect(s.avgMove).toBeNull()
  })

  it('handles empty input', () => {
    const s = earningsSummary([])
    expect(s.total).toBe(0)
    expect(s.beatStreak).toBe(0)
  })
})

describe('peersOf', () => {
  it('returns bucket mates excluding the symbol itself', () => {
    const peers = peersOf('nvda')
    expect(peers).not.toContain('NVDA')
    expect(peers.length).toBeGreaterThan(0)
  })

  it('returns empty for symbols outside every bucket', () => {
    expect(peersOf('^GSPC')).toEqual([])
    expect(peersOf('')).toEqual([])
  })
})

describe('parseCalendarRows + mergeQuarters (deep history)', () => {
  const cal = {
    finance: { result: [{ documents: [{
      columns: [{ id: 'ticker' }, { id: 'startdatetime' }, { id: 'epsactual' }, { id: 'epsestimate' }, { id: 'epssurprisepct' }],
      rows: [
        ['MU', '2026-06-25T16:05:00Z', 2.5, 2.3, 8.7],
        ['MU', '2024-03-20T16:05:00Z', 1.1, 1.0, 10.0],
        ['MU', '2023-12-20T16:05:00Z', null, 0.9, null],
      ],
    }] }] },
  }
  it('parses report/eps columns, percent → fraction', () => {
    const rows = parseCalendarRows(cal)
    expect(rows).toHaveLength(3)
    expect(rows[0].epsActual).toBe(2.5)
    expect(rows[0].surprisePct).toBeCloseTo(0.087)
    expect(rows[1].report).toBe(Date.parse('2024-03-20T16:05:00Z'))
  })
  it('merge keeps v10 as authority and extends with older prints', () => {
    const v10 = [{ quarter: Date.parse('2026-05-31'), epsEstimate: 2.3, epsActual: 2.5, surprisePct: 0.087 }]
    const merged = mergeQuarters(v10, parseCalendarRows(cal))
    // 2026-06-25 report falls in the v10 quarter's window → same print, skipped;
    // 2023 row has no actual → dropped; 2024 survives as an extension
    expect(merged).toHaveLength(2)
    expect(merged[0].quarter).toBe(v10[0].quarter)
    expect(merged[1].quarter).toBeNull()
    expect(merged[1].report).toBe(Date.parse('2024-03-20T16:05:00Z'))
    expect(merged[1].epsActual).toBe(1.1)
  })
})
