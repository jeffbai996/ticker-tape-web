import { describe, it, expect } from 'vitest'
import {
  fmtPrice, fmtPct, fmtPctPlain, fmtFracPct, fmtChange, fmtVol, rangePos,
  fmtPriceBare, sessionMeter,
} from '../../src/lib/format.js'

describe('sessionMeter', () => {
  it('spans from yesterday\'s close to the last trade', () => {
    const m = sessionMeter(100, 200, 180, 120)
    expect(m.from).toBeCloseTo(0.2)
    expect(m.to).toBeCloseTo(0.8)
    expect(m.pos).toBeCloseTo(0.8)
    expect(m.prevPos).toBeCloseTo(0.2)
    expect(m.up).toBe(true)
    expect(m.gap).toBe(false)
  })
  it('orders the span the same way on a down day', () => {
    const m = sessionMeter(100, 200, 120, 180)
    expect(m.from).toBeCloseTo(0.2)
    expect(m.to).toBeCloseTo(0.8)
    expect(m.pos).toBeCloseTo(0.2)
    expect(m.up).toBe(false)
  })
  it('flags a gap and clamps a previous close outside the range', () => {
    const up = sessionMeter(100, 200, 150, 80)
    expect(up.prevPos).toBe(0)
    expect(up.gap).toBe(true)
    expect(up.up).toBe(true)
    const down = sessionMeter(100, 200, 150, 260)
    expect(down.prevPos).toBe(1)
    expect(down.gap).toBe(true)
    expect(down.up).toBe(false)
  })
  it('degenerates to a bare marker without a previous close', () => {
    const m = sessionMeter(100, 200, 150, null)
    expect(m.pos).toBeCloseTo(0.5)
    expect(m.prevPos).toBeNull()
    expect(m.from).toBeCloseTo(0.5)
    expect(m.to).toBeCloseTo(0.5)
  })
  it('returns null when the day range is missing or degenerate', () => {
    expect(sessionMeter(null, 200, 150, 120)).toBeNull()
    expect(sessionMeter(100, 100, 100, 90)).toBeNull()
    expect(sessionMeter(100, 200, null, 120)).toBeNull()
  })
})

describe('rangePos', () => {
  it('places a value proportionally between lo and hi', () => {
    expect(rangePos(100, 200, 150)).toBeCloseTo(0.5)
    expect(rangePos(100, 200, 100)).toBe(0)
    expect(rangePos(100, 200, 200)).toBe(1)
  })
  it('clamps values that drift outside the range', () => {
    expect(rangePos(100, 200, 90)).toBe(0)
    expect(rangePos(100, 200, 260)).toBe(1)
  })
  it('returns null on missing or degenerate ranges', () => {
    expect(rangePos(null, 200, 150)).toBeNull()
    expect(rangePos(100, null, 150)).toBeNull()
    expect(rangePos(100, 200, null)).toBeNull()
    expect(rangePos(100, 100, 100)).toBeNull()
  })
})

describe('fmtPrice', () => {
  it('renders two decimals with thousands separators', () => {
    expect(fmtPrice(1234.5)).toBe('1,234.50')
    expect(fmtPrice(0.5)).toBe('0.50')
  })
  it('renders a dash for missing values', () => {
    expect(fmtPrice(null)).toBe('—')
    expect(fmtPrice(undefined)).toBe('—')
  })
})

describe('fmtPct', () => {
  it('signs and fixes to two decimals', () => {
    expect(fmtPct(2.345)).toBe('+2.35%')
    expect(fmtPct(-0.5)).toBe('-0.50%')
    expect(fmtPct(0)).toBe('+0.00%')
  })
  it('renders a dash for missing values', () => {
    expect(fmtPct(null)).toBe('—')
  })
  it('takes a precision so the one-decimal call sites can share it', () => {
    expect(fmtPct(2.345, 1)).toBe('+2.3%')
    expect(fmtPct(-2.345, 1)).toBe('-2.3%')
  })
})

describe('fmtPctPlain', () => {
  it('leaves the sign to the number — weights and cushions are never "+"', () => {
    expect(fmtPctPlain(12.34)).toBe('12.3%')
    expect(fmtPctPlain(12.345, 2)).toBe('12.35%')
    expect(fmtPctPlain(-3)).toBe('-3.0%')
    expect(fmtPctPlain(null)).toBe('—')
  })
})

describe('fmtFracPct', () => {
  it('scales a fraction and takes a precision', () => {
    expect(fmtFracPct(0.4612)).toBe('46.12%')
    expect(fmtFracPct(0.4612, 1)).toBe('46.1%')
    expect(fmtFracPct(0.4612, 0)).toBe('46%')
    expect(fmtFracPct(null)).toBe('—')
  })
})

describe('fmtChange', () => {
  it('signs the absolute change', () => {
    expect(fmtChange(1.234)).toBe('+1.23')
    expect(fmtChange(-10)).toBe('-10.00')
  })
})

describe('fmtVol', () => {
  it('abbreviates large volumes', () => {
    expect(fmtVol(71_900_726)).toBe('71.9M')
    expect(fmtVol(1_500)).toBe('1.5K')
    expect(fmtVol(2_100_000_000)).toBe('2.1B')
    expect(fmtVol(900)).toBe('900')
  })
  it('renders a dash for missing values', () => {
    expect(fmtVol(null)).toBe('—')
  })
})


describe('fmtPriceBare', () => {
  it('drops the thousands separator', () => {
    expect(fmtPriceBare(1033)).toBe('1033.00')
    expect(fmtPriceBare(1027.06)).toBe('1027.06')
  })

  it('still shows two decimals under a thousand', () => {
    expect(fmtPriceBare(91)).toBe('91.00')
    expect(fmtPriceBare(303.42)).toBe('303.42')
  })

  it('collapses to K-notation only at true KRW scale', () => {
    // full commas broke the fixed column grid — K holds it; the threshold
    // must clear NQ/DOW-sized index prints untouched (2026-08-06)
    expect(fmtPriceBare(1234567.5)).toBe('1235K')
    expect(fmtPriceBare(29537.25)).toBe('29537.25')
    expect(fmtPriceBare(9999.99)).toBe('9999.99')
  })

  it('matches fmtPrice except for the separator', () => {
    expect(fmtPriceBare(1033)).toBe(fmtPrice(1033).replace(/,/g, ''))
  })

  it('passes through missing values', () => {
    expect(fmtPriceBare(null)).toBe(fmtPrice(null))
    expect(fmtPriceBare(NaN)).toBe(fmtPrice(NaN))
  })
})

describe('KRW-scale prices', () => {
  it('fmtPrice collapses to K only above 100k — indices stay full', () => {
    expect(fmtPrice(1495000)).toBe('1495K')
    expect(fmtPrice(54349.12)).toBe('54,349.12')
    expect(fmtPrice(29537.25)).toBe('29,537.25')
  })
  it('fmtChange keeps its sign in K-notation at scale', () => {
    expect(fmtChange(-173000)).toBe('-173K')
    expect(fmtChange(-465.83)).toBe('-465.83')
    expect(fmtChange(77.12)).toBe('+77.12')
  })
})
