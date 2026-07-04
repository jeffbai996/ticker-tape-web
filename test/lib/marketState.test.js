import { describe, it, expect } from 'vitest'
import { marketState, etParts, HOLIDAYS } from '../../src/lib/marketState.js'

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
