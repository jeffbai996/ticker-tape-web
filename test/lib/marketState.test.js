import { describe, it, expect } from 'vitest'
import { marketState, etParts, isOvernight, rollCashSession, nextSessionInfo, HOLIDAYS } from '../../src/lib/marketState.js'

// All fixtures pin the UTC offset explicitly (EDT −4 in summer, EST −5 in
// winter) so the tests are independent of the runner's local timezone.

describe('etParts', () => {
  it('converts an EDT instant to ET wall-clock fields', () => {
    const p = etParts(new Date('2026-07-06T13:45:00-04:00'))
    expect(p.hh).toBe(13)
    expect(p.mm).toBe(45)
    expect(p.day).toBe(1) // Monday
    expect(p.iso).toBe('2026-07-06')
  })

  it('handles EST (winter) offsets', () => {
    const p = etParts(new Date('2026-12-16T09:30:00-05:00'))
    expect(p.hh).toBe(9)
    expect(p.mm).toBe(30)
    expect(p.iso).toBe('2026-12-16')
  })
})

describe('marketState', () => {
  const state = (s) => marketState(new Date(s)).state

  it('pre-market from 04:00 to 09:30 ET', () => {
    expect(state('2026-07-06T04:00:00-04:00')).toBe('pre')
    expect(state('2026-07-06T09:29:59-04:00')).toBe('pre')
  })

  it('open from 09:30 to 16:00 ET', () => {
    expect(state('2026-07-06T09:30:00-04:00')).toBe('open')
    expect(state('2026-07-06T15:59:59-04:00')).toBe('open')
  })

  it('post from 16:00 to 20:00 ET', () => {
    expect(state('2026-07-06T16:00:00-04:00')).toBe('post')
    expect(state('2026-07-06T19:59:59-04:00')).toBe('post')
  })

  it('closed overnight', () => {
    expect(state('2026-07-06T20:00:00-04:00')).toBe('closed')
    expect(state('2026-07-06T03:59:59-04:00')).toBe('closed')
  })

  it('closed on weekends', () => {
    expect(state('2026-07-04T12:00:00-04:00')).toBe('closed') // Saturday
    expect(state('2026-07-05T12:00:00-04:00')).toBe('closed') // Sunday
  })

  it('closed on holidays with the holiday name', () => {
    const r = marketState(new Date('2026-07-03T12:00:00-04:00')) // observed July 4th
    expect(r.state).toBe('closed')
    expect(r.holiday).toBeTruthy()
  })

  it('no holiday flag on a regular trading day', () => {
    const r = marketState(new Date('2026-12-16T10:00:00-05:00'))
    expect(r.state).toBe('open')
    expect(r.holiday).toBeNull()
  })

  it('weekend holiday dates do not raise the holiday flag on adjacent days', () => {
    // 2026-07-04 itself is a Saturday; the table holds the observed Friday.
    expect(HOLIDAYS['2026-07-03']).toBeTruthy()
    expect(HOLIDAYS['2026-07-04']).toBeUndefined()
  })
})

describe('isOvernight', () => {
  const at = (iso) => new Date(iso)

  it('covers the Blue Ocean session, Sunday 20:00 ET through Friday 20:00 ET', () => {
    expect(isOvernight(at('2026-08-05T23:30:00-04:00'))).toBe(true)   // Wed night
    expect(isOvernight(at('2026-08-06T02:00:00-04:00'))).toBe(true)   // Thu 2am
    expect(isOvernight(at('2026-08-09T21:00:00-04:00'))).toBe(true)   // Sun reopen
  })

  it('excludes the regular and after-hours sessions', () => {
    expect(isOvernight(at('2026-08-05T11:00:00-04:00'))).toBe(false)  // open
    expect(isOvernight(at('2026-08-05T18:30:00-04:00'))).toBe(false)  // AH
    expect(isOvernight(at('2026-08-05T05:00:00-04:00'))).toBe(false)  // pre
  })

  it('stays shut for the weekend after Friday 20:00 ET', () => {
    expect(isOvernight(at('2026-08-07T21:00:00-04:00'))).toBe(false)  // Fri night
    expect(isOvernight(at('2026-08-08T02:00:00-04:00'))).toBe(false)  // Sat 2am
    expect(isOvernight(at('2026-08-07T02:00:00-04:00'))).toBe(true)   // Fri 2am
  })
})

describe('rollCashSession', () => {
  it('rolls at the 09:30 ET open and holds that session through off-hours', () => {
    const prior = '2026-08-09'
    expect(rollCashSession(prior, new Date('2026-08-10T09:29:59-04:00'))).toBe(prior)
    expect(rollCashSession(prior, new Date('2026-08-10T09:30:00-04:00'))).toBe('2026-08-10')
    expect(rollCashSession('2026-08-10', new Date('2026-08-10T20:30:00-04:00'))).toBe('2026-08-10')
  })
})

describe('nextSessionInfo — the chip only promises sessions that will happen (A31 F2)', () => {
  const at = (iso) => new Date(iso)

  it('counts down to an edge that lands on the same trading day', () => {
    // Wed 06:00 ET: pre-market opens today at 04:00? no — 06:00 is past it;
    // the next edge is the 09:30 open, 3h 30m away.
    expect(nextSessionInfo(at('2026-10-14T06:00:00-04:00')))
      .toEqual({ event: 'session opens in {t}', minutes: 210 })
    // Wed 17:00 ET: after-hours ends today at 20:00.
    expect(nextSessionInfo(at('2026-10-14T17:00:00-04:00')))
      .toEqual({ event: 'after-hours ends in {t}', minutes: 180 })
  })

  it('names the next real session (day + pre-market time) on weeknights after 20:00', () => {
    // Wed 21:00 ET → Thursday, not "monday" (the old walk said monday).
    expect(nextSessionInfo(at('2026-10-14T21:00:00-04:00')))
      .toEqual({ day: 'Thursday', time: '04:00' })
    // Thu 23:30 ET → Friday.
    expect(nextSessionInfo(at('2026-10-15T23:30:00-04:00')))
      .toEqual({ day: 'Friday', time: '04:00' })
  })

  it('never promises a session on weekends — the old walk advertised one', () => {
    // Sat 05:00 ET (old tooltip: "session opens in 4h 30m").
    expect(nextSessionInfo(at('2026-10-17T09:00:00Z')))
      .toEqual({ day: 'Monday', time: '04:00' })
    // Sun 10:00 ET (old tooltip: "session closes in 6h 0m").
    expect(nextSessionInfo(at('2026-10-18T14:00:00Z')))
      .toEqual({ day: 'Monday', time: '04:00' })
  })

  it('skips exchange holidays to the next trading day', () => {
    // Fri 2026-07-03 is observed Independence Day; 21:00 ET → Monday Jul 6.
    expect(nextSessionInfo(at('2026-07-03T21:00:00-04:00')))
      .toEqual({ day: 'Monday', time: '04:00' })
    // Sat before the holiday: Fri Jul 3 is closed, so Monday again.
    expect(nextSessionInfo(at('2026-07-04T12:00:00-04:00')))
      .toEqual({ day: 'Monday', time: '04:00' })
  })

  it('keeps same-day countdowns on a holiday-free weekday morning', () => {
    expect(nextSessionInfo(at('2026-10-19T01:30:00-04:00')))
      .toEqual({ event: 'pre-market opens in {t}', minutes: 150 })
  })
})
