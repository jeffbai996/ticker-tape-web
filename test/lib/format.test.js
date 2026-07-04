import { describe, it, expect } from 'vitest'
import { fmtPrice, fmtPct, fmtChange, fmtVol } from '../../src/lib/format.js'

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
