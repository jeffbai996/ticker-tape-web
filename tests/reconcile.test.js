import { describe, expect, it } from 'vitest'
import {
  fiscalMonths, medianReportLag, quarterForReport, reconcileQuarters,
} from '../src/lib/earnings.js'

const utc = (y, m, d) => Date.UTC(y, m - 1, d)

describe('fiscalMonths', () => {
  it('learns a calendar-year filer', () => {
    const evs = [{ quarter: utc(2025, 3, 31) }, { quarter: utc(2025, 6, 30) }]
    expect(fiscalMonths(evs)).toEqual([2, 5])
  })

  it('learns an off-calendar filer', () => {
    const evs = [{ quarter: utc(2025, 1, 26) }, { quarter: utc(2025, 4, 27) }]
    expect(fiscalMonths(evs)).toEqual([0, 3])
  })

  it('is empty when nothing is dated', () => {
    expect(fiscalMonths([{ report: utc(2025, 5, 1) }])).toEqual([])
  })
})

describe('quarterForReport', () => {
  it('maps an april print to the march quarter for a calendar filer', () => {
    const q = quarterForReport(utc(2025, 4, 24), [2, 5, 8, 11])
    expect(new Date(q).toISOString().slice(0, 10)).toBe('2025-03-31')
  })

  it('maps a january print to the previous december', () => {
    const q = quarterForReport(utc(2025, 1, 30), [2, 5, 8, 11])
    expect(new Date(q).toISOString().slice(0, 10)).toBe('2024-12-31')
  })

  it('respects an off-calendar fiscal year', () => {
    // Jan/Apr/Jul/Oct filer reporting late May covers the April quarter
    const q = quarterForReport(utc(2025, 5, 28), [0, 3, 6, 9])
    expect(new Date(q).toISOString().slice(0, 10)).toBe('2025-04-30')
  })

  it('will not attribute a print to a quarter that only just closed', () => {
    // Two days after quarter-end nobody has reported it yet — that print
    // belongs to the quarter before.
    const q = quarterForReport(utc(2025, 4, 2), [2, 5, 8, 11])
    expect(new Date(q).toISOString().slice(0, 10)).toBe('2024-12-31')
  })

  it('is null without a pattern or a date', () => {
    expect(quarterForReport(utc(2025, 4, 24), [])).toBe(null)
    expect(quarterForReport(null, [2, 5, 8, 11])).toBe(null)
  })
})

describe('medianReportLag', () => {
  it('takes the median of complete rows', () => {
    const evs = [
      { quarter: utc(2025, 3, 31), report: utc(2025, 4, 20) },   // 20
      { quarter: utc(2024, 12, 31), report: utc(2025, 1, 30) },  // 30
      { quarter: utc(2024, 9, 30), report: utc(2024, 10, 25) },  // 25
    ]
    expect(medianReportLag(evs)).toBe(25)
  })

  it('ignores impossible lags', () => {
    const evs = [{ quarter: utc(2025, 3, 31), report: utc(2024, 1, 1) }]
    expect(medianReportLag(evs)).toBe(null)
  })

  it('is null with nothing complete', () => {
    expect(medianReportLag([{ quarter: utc(2025, 3, 31) }])).toBe(null)
  })
})

describe('reconcileQuarters', () => {
  const evs = [
    { quarter: utc(2025, 9, 30), epsActual: 1 },                        // no report
    { report: utc(2025, 4, 24), epsActual: 2 },                         // no quarter
    { quarter: utc(2025, 3, 31), report: utc(2025, 4, 25), epsActual: 3 },
    { quarter: utc(2024, 12, 31), report: utc(2025, 1, 28), epsActual: 4 },
  ]

  it('infers the quarter for a calendar-only row', () => {
    const out = reconcileQuarters(evs)
    expect(new Date(out[1].quarter).toISOString().slice(0, 10)).toBe('2025-03-31')
    expect(out[1].quarterInferred).toBe(true)
  })

  it('infers the report date for a quarter-only row', () => {
    const out = reconcileQuarters(evs)
    expect(out[0].report).toBeGreaterThan(out[0].quarter)
    expect(out[0].reportInferred).toBe(true)
  })

  it('leaves complete rows untouched and unflagged', () => {
    const out = reconcileQuarters(evs)
    expect(out[2]).toEqual(evs[2])
    expect(out[2].quarterInferred).toBeUndefined()
    expect(out[2].reportInferred).toBeUndefined()
  })

  it('learns the lag from rows it just inferred, when no row started complete', () => {
    // The real shape from the API: v10 quarters and calendar reports never
    // overlap, so the lag is only measurable after quarters are inferred.
    const disjoint = [
      { quarter: utc(2025, 12, 31), epsActual: 1 },
      { quarter: utc(2025, 9, 30), epsActual: 2 },
      { quarter: utc(2025, 6, 30), epsActual: 3 },
      { quarter: utc(2025, 3, 31), epsActual: 4 },   // four quarters = full pattern
      { report: utc(2024, 10, 24), epsActual: 5 },
      { report: utc(2024, 7, 23), epsActual: 6 },
    ]
    const out = reconcileQuarters(disjoint)
    expect(out.every((e) => e.quarter != null && e.report != null)).toBe(true)
    expect(out[0].reportInferred).toBe(true)
  })

  it('declines to guess a quarter when the fiscal pattern is only half-learned', () => {
    // Two known quarter-ends isn't a pattern; mislabelling the tape is worse
    // than leaving a gap.
    const thin = [{ quarter: utc(2025, 9, 30) }, { report: utc(2025, 4, 24) }]
    expect(reconcileQuarters(thin)[1].quarter).toBeUndefined()
  })

  it('survives an empty list', () => {
    expect(reconcileQuarters([])).toEqual([])
    expect(reconcileQuarters(null)).toEqual([])
  })
})
