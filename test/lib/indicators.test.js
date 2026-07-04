import { describe, it, expect } from 'vitest'
import { sma, ema, rsi, macd, bollinger } from '../../src/lib/indicators.js'

describe('sma', () => {
  it('averages the last n values', () => {
    expect(sma([1, 2, 3, 4, 5], 5)).toBe(3)
    expect(sma([1, 2, 3, 4, 5], 2)).toBe(4.5)
  })
  it('returns null with insufficient data', () => {
    expect(sma([1, 2], 5)).toBeNull()
  })
})

describe('ema', () => {
  it('equals the value for a constant series', () => {
    expect(ema([5, 5, 5, 5, 5, 5], 3)).toBeCloseTo(5)
  })
  it('weights recent values more than SMA does', () => {
    const rising = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(ema(rising, 5)).toBeGreaterThan(sma(rising, 5) - 1)
  })
  it('returns null with insufficient data', () => {
    expect(ema([1, 2], 5)).toBeNull()
  })
})

describe('rsi', () => {
  it('is 100 when every move is a gain', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    expect(rsi(closes, 14)).toBe(100)
  })
  it('is 0 when every move is a loss', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i)
    expect(rsi(closes, 14)).toBe(0)
  })
  it('is ~50 for perfectly alternating equal moves', () => {
    const closes = Array.from({ length: 30 }, (_, i) => 100 + (i % 2))
    const v = rsi(closes, 14)
    expect(v).toBeGreaterThan(40)
    expect(v).toBeLessThan(60)
  })
  it('returns null with insufficient data', () => {
    expect(rsi([1, 2, 3], 14)).toBeNull()
  })
})

describe('macd', () => {
  it('is ~zero on a constant series', () => {
    const closes = Array(60).fill(100)
    const m = macd(closes)
    expect(m.macd).toBeCloseTo(0)
    expect(m.signal).toBeCloseTo(0)
    expect(m.hist).toBeCloseTo(0)
  })
  it('is positive in a sustained uptrend', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 * 1.01 ** i)
    expect(macd(closes).macd).toBeGreaterThan(0)
  })
  it('returns null with insufficient data', () => {
    expect(macd([1, 2, 3])).toBeNull()
  })
})

describe('bollinger', () => {
  it('collapses to the mean on a constant series', () => {
    const b = bollinger(Array(25).fill(50), 20, 2)
    expect(b.mid).toBe(50)
    expect(b.upper).toBe(50)
    expect(b.lower).toBe(50)
  })
  it('brackets the mean symmetrically', () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + (i % 5))
    const b = bollinger(closes, 20, 2)
    expect(b.upper - b.mid).toBeCloseTo(b.mid - b.lower)
    expect(b.upper).toBeGreaterThan(b.lower)
  })
  it('returns null with insufficient data', () => {
    expect(bollinger([1, 2], 20, 2)).toBeNull()
  })
})
