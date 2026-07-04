import { describe, it, expect } from 'vitest'
import { daysUntil, upcomingEvents, ECON_EVENTS } from '../../src/lib/markets.js'

describe('daysUntil', () => {
  it('counts forward days', () => {
    expect(daysUntil('2026-07-10', '2026-07-03')).toBe(7)
  })
  it('is zero on the day', () => {
    expect(daysUntil('2026-07-03', '2026-07-03')).toBe(0)
  })
  it('is negative for past events', () => {
    expect(daysUntil('2026-06-30', '2026-07-03')).toBe(-3)
  })
})

describe('upcomingEvents', () => {
  const events = [
    { date: '2026-07-01', type: 'CPI' },
    { date: '2026-07-14', type: 'CPI' },
    { date: '2026-07-29', type: 'FOMC' },
    { date: '2026-12-16', type: 'FOMC' },
  ]

  it('keeps only future events inside the horizon, sorted soonest first', () => {
    const out = upcomingEvents(events, '2026-07-03', 30)
    expect(out.map((e) => e.date)).toEqual(['2026-07-14', '2026-07-29'])
    expect(out[0].days).toBe(11)
  })

  it('includes today', () => {
    const out = upcomingEvents(events, '2026-07-01', 5)
    expect(out[0].date).toBe('2026-07-01')
    expect(out[0].days).toBe(0)
  })
})

describe('ECON_EVENTS', () => {
  it('is sorted ascending by date', () => {
    const dates = ECON_EVENTS.map((e) => e.date)
    expect(dates).toEqual([...dates].sort())
  })
})
