import { describe, it, expect } from 'vitest'
import {
  daysUntil, upcomingEvents, ECON_EVENTS, MARKET_GROUPS, COMMODITY_GROUPS,
  MARKET_DECK, RELATIVE_SIGNALS, EARNINGS_UNIVERSE, EARNINGS_NAMES,
  nthBusinessDay, nthWeekdayOfMonth, shiftDays, eventDayLabel,
  calendarEventDetails,
} from '../../src/lib/markets.js'
import { hasLabelTranslation } from '../../src/lib/i18n.js'

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

  it('gives every scheduled event useful drill-down context', () => {
    for (const event of ECON_EVENTS) {
      const details = calendarEventDetails(event)
      expect(details.description, event.type).toBeTruthy()
      expect(details.source, event.type).toBeTruthy()
      expect(details.time, event.type).toBeTruthy()
    }
  })

  it('preserves available release data and scalar source metadata', () => {
    const details = calendarEventDetails({
      date: '2026-08-12', type: 'CPI', label: 'CPI Release',
      actual: '2.8%', estimate: '2.7%', previous: '2.6%',
      metadata: { period: 'July 2026', revised: false, nested: { ignore: true }, empty: '' },
    })

    expect(details.facts).toEqual(expect.arrayContaining([
      { label: 'Actual', value: '2.8%' },
      { label: 'Estimate', value: '2.7%' },
      { label: 'Previous', value: '2.6%' },
      { label: 'Period', value: 'July 2026' },
      { label: 'Revised', value: 'No' },
    ]))
    expect(details.facts.some((fact) => fact.label === 'Nested')).toBe(false)
    expect(details.facts.some((fact) => fact.label === 'Empty')).toBe(false)
  })

  it('describes user catalysts without inventing release data', () => {
    const details = calendarEventDetails({
      date: '2026-09-09', type: 'PRODUCT', label: 'Example Co — keynote',
      rawLabel: 'keynote', symbol: 'EXM', user: true,
    })

    expect(details.source).toBe('User catalyst')
    expect(details.facts).toEqual(expect.arrayContaining([
      { label: 'Symbol', value: 'EXM' },
      { label: 'Category', value: 'PRODUCT' },
    ]))
    expect(details.url).toBe('')
  })
})

describe('market coverage', () => {
  it('covers the major cross-asset regions instead of leaving the overview sparse', () => {
    const names = MARKET_GROUPS.map((g) => g.name)
    expect(names).toEqual(expect.arrayContaining([
      'US Equity', 'Global ETFs', 'Canada', 'Europe', 'Asia-Pacific',
      'Rates', 'Credit', 'Volatility', 'FX', 'Crypto',
    ]))
    expect(MARKET_GROUPS.flatMap((g) => g.items).filter((i) => i.symbol).length).toBeGreaterThanOrEqual(75)
    expect(COMMODITY_GROUPS.flatMap((g) => g.items).length).toBeGreaterThanOrEqual(30)
  })

  it('exposes a front-page market deck and relative-value signals', () => {
    expect(MARKET_DECK.length).toBeGreaterThanOrEqual(6)
    expect(RELATIVE_SIGNALS.length).toBeGreaterThanOrEqual(5)
  })

  it('ships Chinese labels for every expanded market surface', () => {
    const labels = [
      ...MARKET_GROUPS.flatMap((group) => [group.name, ...group.items.map((item) => item.label)]),
      ...COMMODITY_GROUPS.flatMap((group) => [group.name, ...group.items.map((item) => item.label)]),
      ...MARKET_DECK.map((item) => item.label),
      ...RELATIVE_SIGNALS.map((item) => item.label),
    ]
    expect(labels.filter((label) => !hasLabelTranslation(label))).toEqual([])
  })
})


describe('econ calendar date rules', () => {
  it('finds the first business day, skipping a weekend', () => {
    // 2026-08-01 is a Saturday, so ISM manufacturing lands on Monday the 3rd
    expect(nthBusinessDay(2026, 8, 1)).toBe('2026-08-03')
    expect(nthBusinessDay(2026, 7, 1)).toBe('2026-07-01')
  })
  it('skips federal holidays when counting business days', () => {
    // Jan 1 is New Year's Day: business days are the 2nd, 5th, 6th
    expect(nthBusinessDay(2026, 1, 1)).toBe('2026-01-02')
    expect(nthBusinessDay(2026, 1, 3)).toBe('2026-01-06')
    // Jul 1-2 count, Jul 3 is the observed Independence Day and Jul 4-5 the
    // weekend, so the third business day falls on Monday the 6th
    expect(nthBusinessDay(2026, 7, 3)).toBe('2026-07-06')
  })
  it('finds the nth weekday of a month', () => {
    // second Friday of August 2026
    expect(nthWeekdayOfMonth(2026, 8, 5, 2)).toBe('2026-08-14')
    expect(nthWeekdayOfMonth(2026, 1, 5, 2)).toBe('2026-01-09')
  })
  it('shifts ISO dates across month ends', () => {
    expect(shiftDays('2026-01-28', 21)).toBe('2026-02-18')
    expect(shiftDays('2026-12-16', 21)).toBe('2027-01-06')
  })
  it('carries the widened event set without duplicate date+type pairs', () => {
    for (const type of ['ISM', 'ISMS', 'MINS', 'UMCH']) {
      expect(ECON_EVENTS.some((e) => e.type === type)).toBe(true)
    }
    const keys = ECON_EVENTS.map((e) => `${e.date}|${e.type}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
  it('keeps every event date on a weekday', () => {
    const weekend = ECON_EVENTS
      .filter((e) => [0, 6].includes(new Date(`${e.date}T00:00:00Z`).getUTCDay()))
      .map((e) => `${e.date} ${e.type}`)
    expect(weekend).toEqual([])
  })
})

describe('earnings universe names', () => {
  it('names every symbol in the universe', () => {
    const missing = EARNINGS_UNIVERSE.filter((s) => !EARNINGS_NAMES[s])
    expect(missing).toEqual([])
  })
})

describe('calendar look-back', () => {
  const evs = [
    { date: '2026-08-04', type: 'NFP', label: 'Nonfarm Payrolls' },   // 3 days ago
    { date: '2026-08-06', type: 'CPI', label: 'CPI Release' },        // 1 day ago
    { date: '2026-08-07', type: 'PPI', label: 'PPI Release' },        // today
    { date: '2026-08-12', type: 'RET', label: 'Retail Sales' },       // future
  ]

  it('excludes past events unless a look-back is asked for', () => {
    const got = upcomingEvents(evs, '2026-08-07', 60).map((e) => e.type)
    expect(got).toEqual(['PPI', 'RET'])
  })

  it('admits exactly the requested days of look-back', () => {
    // a print that landed yesterday is still what you're reasoning about today
    expect(upcomingEvents(evs, '2026-08-07', 60, 1).map((e) => e.type))
      .toEqual(['CPI', 'PPI', 'RET'])
    expect(upcomingEvents(evs, '2026-08-07', 60, 3).map((e) => e.type))
      .toEqual(['NFP', 'CPI', 'PPI', 'RET'])
  })

  it('orders oldest first so the past/future boundary is one place', () => {
    const days = upcomingEvents(evs, '2026-08-07', 60, 3).map((e) => e.days)
    expect(days).toEqual([...days].sort((a, b) => a - b))
    expect(days[0]).toBe(-3)
  })

  it('labels a past event "ago", not as a negative day count', () => {
    // "-1d" in a column of plain day counts scans as a negative number
    expect(eventDayLabel(-1)).toBe('1da')
    expect(eventDayLabel(-3)).toBe('3da')
    expect(eventDayLabel(0)).toBe('today')
    expect(eventDayLabel(4)).toBe('4d')
  })
})
