import { describe, it, expect } from 'vitest'
import { sessionDayPct, dayPnlFromValue } from '../../src/lib/dayPnl.js'
import { positionRows, accountSummary } from '../../src/lib/demo.js'

describe('sessionDayPct — day P&L follows the tape, not the calendar', () => {
  it('pre-market of a new day is the move since the last close, not yesterday', () => {
    // Monday closed +4.13%; Tuesday 05:30 ET pre-market is -1.2%
    expect(sessionDayPct({ pct: 4.13, extLabel: 'PM', extPct: -1.2, extPrice: 949 })).toBeCloseTo(-1.2)
  })
  it('after hours and overnight compound today with the extended move', () => {
    const q = { pct: 2.0, extLabel: 'AH', extPct: 1.0, extPrice: 103.02 }
    expect(sessionDayPct(q)).toBeCloseTo(3.02)
    expect(sessionDayPct({ ...q, extLabel: 'ON' })).toBeCloseTo(3.02)
  })
  it('falls back to the regular move when there is no extended print', () => {
    expect(sessionDayPct({ pct: -0.5, extLabel: 'PM', extPct: null, extPrice: null })).toBeCloseTo(-0.5)
    expect(sessionDayPct({ pct: -0.5 })).toBeCloseTo(-0.5)
    expect(sessionDayPct(null)).toBeNull()
    expect(sessionDayPct({})).toBeNull()
  })
  it('discounts today\'s value back to the last close for the money number', () => {
    expect(dayPnlFromValue(1000, 25)).toBeCloseTo(200)     // 800 → 1000
    expect(dayPnlFromValue(1000, null)).toBeNull()
  })
})

describe('positionRows uses the session-aware day move', () => {
  const POS = [{ symbol: 'AAA', shares: 10, avgCost: 80 }]
  it('yahoo-priced rows: pre-market flips a green Monday to a red Tuesday', () => {
    const rows = positionRows(POS, { AAA: { price: 100, pct: 4.0, change: 3.85,
      extLabel: 'PM', extPct: -1.0, extPrice: 99 } })
    expect(rows[0].dayPct).toBeCloseTo(-1.0)
    expect(rows[0].dayPnl).toBeLessThan(0)
  })
  it('broker-priced rows: same rule on the broker mark', () => {
    const rows = positionRows([{ ...POS[0], livePrice: 99, liveValue: 990, liveBase: 990 }],
      { AAA: { price: 100, pct: 4.0, extLabel: 'PM', extPct: -1.0, extPrice: 99 } })
    expect(rows[0].dayPct).toBeCloseTo(-1.0)
    expect(rows[0].dayPnl).toBeCloseTo(-10)          // 1000 → 990
    const s = accountSummary([{ ...POS[0], livePrice: 99, liveValue: 990, liveBase: 990 }],
      { AAA: { price: 100, pct: 4.0, extLabel: 'PM', extPct: -1.0, extPrice: 99 } }, 0)
    expect(s.dayPnl).toBeCloseTo(-10)
  })
})
