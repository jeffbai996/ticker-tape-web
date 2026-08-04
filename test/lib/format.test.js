import { describe, it, expect } from 'vitest'
import { fmtPrice, fmtPct, fmtChange, fmtVol, rangePos, fmtPriceBare } from '../../src/lib/format.js'

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

  it('handles millions without commas', () => {
    expect(fmtPriceBare(1234567.5)).toBe('1234567.50')
  })

  it('matches fmtPrice except for the separator', () => {
    expect(fmtPriceBare(1033)).toBe(fmtPrice(1033).replace(/,/g, ''))
  })

  it('passes through missing values', () => {
    expect(fmtPriceBare(null)).toBe(fmtPrice(null))
    expect(fmtPriceBare(NaN)).toBe(fmtPrice(NaN))
  })
})
