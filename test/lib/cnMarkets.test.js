/** The HK / mainland holder's glance: venues, sessions, limits, FX — pure. */
import { describe, expect, it } from 'vitest'
import { fxDayPct, fxImpact, limitFlag, marketSession, venueDayBreakdown, venueOfSymbol } from '../../src/lib/cnMarkets.js'

describe('venueOfSymbol / limitFlag', () => {
  it('files symbols by suffix and flags A-share limit moves by board', () => {
    expect(['0700.HK', '600036.SS', '300308.SZ', 'AAPL', 'RY.TO'].map(venueOfSymbol)).toEqual(['HK', 'CN', 'CN', 'US', 'CA'])
    expect(limitFlag('600036.SS', 9.98)).toBe('up')
    expect(limitFlag('600036.SS', -9.9)).toBe('down')
    expect(limitFlag('688008.SS', 10)).toBeNull()          // STAR limit is 20
    expect(limitFlag('688008.SS', 19.9)).toBe('up')
    expect(limitFlag('0700.HK', 12)).toBeNull()            // HK has no limit
    expect(limitFlag('600036.SS', null)).toBeNull()
  })
})

describe('marketSession', () => {
  // 2026-08-21 is a Friday. 02:00Z = 10:00 HKT (open), 04:30Z = 12:30 HKT (lunch), 09:00Z = 17:00 HKT (closed)
  it('reads the venue clock, not the reader\'s', () => {
    expect(marketSession('HK', new Date('2026-08-21T02:00:00Z')).state).toBe('open')
    expect(marketSession('HK', new Date('2026-08-21T04:30:00Z')).state).toBe('lunch')
    expect(marketSession('CN', new Date('2026-08-21T04:30:00Z')).state).toBe('lunch')
    expect(marketSession('HK', new Date('2026-08-21T09:00:00Z')).state).toBe('closed')
    expect(marketSession('HK', new Date('2026-08-21T00:30:00Z'))).toMatchObject({ state: 'pre', opensAt: '09:30' })
    expect(marketSession('US', new Date('2026-08-21T15:00:00Z')).state).toBe('open')   // 11:00 ET
    expect(marketSession('HK', new Date('2026-08-22T03:00:00Z'))).toMatchObject({ state: 'closed', weekend: true })
  })
})

describe('venueDayBreakdown / fx', () => {
  const rows = [
    { symbol: '0700.HK', kind: 'equity', ccy: 'HKD', valueDisplay: 6000, dayPnlDisplay: 60 },
    { symbol: '2628.HK', kind: 'equity', ccy: 'HKD', valueDisplay: 3000, dayPnlDisplay: -30 },
    { symbol: '600036.SS', kind: 'equity', ccy: 'CNY', valueDisplay: 1000, dayPnlDisplay: 10 },
    { symbol: 'CASH.CNY', kind: 'cash', ccy: 'CNY', valueDisplay: 500, dayPnlDisplay: null },
  ]
  it('splits value and day P&L by venue, biggest first', () => {
    const out = venueDayBreakdown(rows)
    expect(out.map((b) => [b.venue, b.value, b.dayPnl, b.names])).toEqual([['HK', 9000, 30, 2], ['CN', 1000, 10, 1]])
    expect(out[0].weightPct).toBeCloseTo(90)
    expect(out[0].dayPct).toBeCloseTo((30 / 8970) * 100)
  })
  it('attributes the currency part of the day to FX, per currency', () => {
    const fx = fxDayPct({ 'HKDUSD=X': { quote: { pct: 0.5 } }, 'CNYUSD=X': { quote: { pct: -0.5 } } }, ['HKD', 'CNY', 'USD'], 'CNY')
    expect(fx.HKD).toBeCloseTo(((1.005 / 0.995) - 1) * 100)
    expect(fx.USD).toBeCloseTo(((1 / 0.995) - 1) * 100)
    const imp = fxImpact(rows, fx, 'CNY')
    expect(imp.byCcy.HKD).toBeCloseTo(9000 - 9000 / (1 + fx.HKD / 100))
    expect(imp.byCcy.CNY).toBeUndefined()
    expect(imp.total).toBeCloseTo(imp.byCcy.HKD)
  })
})
