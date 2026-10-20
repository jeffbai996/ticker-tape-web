// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { niceScale, dateTicks, shortDate } from '../../src/lib/chartAxis.js'

describe('niceScale', () => {
  it('snaps an awkward range to round steps that cover it', () => {
    const s = niceScale(73.0, 155.0, 4)
    expect(s.step).toBe(20)
    expect(s.ticks).toEqual([60, 80, 100, 120, 140, 160])
    expect(s.lo).toBe(60)
    expect(s.hi).toBe(160)
  })
  it('uses decimal steps for a narrow range and reports the digits to print', () => {
    const s = niceScale(99.2, 101.1, 4)
    expect(s.step).toBe(0.5)
    expect(s.ticks[0]).toBe(99)
    expect(s.digits).toBe(1)
  })
  it('handles a flat series without dividing by zero', () => {
    const s = niceScale(100, 100, 4)
    expect(s.ticks.length).toBeGreaterThanOrEqual(2)
    expect(s.lo).toBeLessThan(100)
    expect(s.hi).toBeGreaterThan(100)
  })
})

describe('date axis', () => {
  const days = (from, n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, from[0] - 1, from[1] + i)).toISOString().slice(0, 10))
  it('labels a multi-month span at the first session of each month', () => {
    const dates = days([7, 20], 92)
    const ticks = dateTicks(dates, { locale: 'en' })
    expect(ticks.map((t) => t.label)).toEqual(['Aug', 'Sep', 'Oct'])
    expect(dates[ticks[0].index]).toBe('2026-08-01')
  })
  it('names the year on January when a span crosses it', () => {
    const ticks = dateTicks(days([11, 1], 120), { locale: 'en' })
    expect(ticks.map((t) => t.label)).toContain('Jan 2027')
  })
  it('uses short day labels inside a single month', () => {
    const ticks = dateTicks(days([10, 1], 20), { locale: 'en', max: 4 })
    expect(ticks.length).toBeLessThanOrEqual(4)
    expect(ticks[0].label).toBe('Oct 1')
  })
  it('writes Chinese month and day labels', () => {
    expect(shortDate('2026-07-20', 'zh')).toBe('7月20日')
    expect(dateTicks(days([7, 20], 92), { locale: 'zh' }).map((t) => t.label)).toEqual(['8月', '9月', '10月'])
  })
})
