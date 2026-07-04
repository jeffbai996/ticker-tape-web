import { describe, it, expect } from 'vitest'
import { dailyReturns, pearson, normalize } from '../../src/lib/stats.js'

describe('dailyReturns', () => {
  it('computes simple returns', () => {
    const r = dailyReturns([100, 110, 99])
    expect(r).toHaveLength(2)
    expect(r[0]).toBeCloseTo(0.1)
    expect(r[1]).toBeCloseTo(-0.1)
  })
  it('is empty with fewer than two points', () => {
    expect(dailyReturns([100])).toEqual([])
  })
})

describe('pearson', () => {
  it('is 1 for perfectly correlated series', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1)
  })
  it('is -1 for perfectly inverse series', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1)
  })
  it('is ~0 for orthogonal series', () => {
    expect(Math.abs(pearson([1, -1, 1, -1], [1, 1, -1, -1]))).toBeLessThan(0.01)
  })
  it('is null when a series is constant (zero variance)', () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })
  it('is null on mismatched or short input', () => {
    expect(pearson([1, 2], [1])).toBeNull()
    expect(pearson([1], [1])).toBeNull()
  })
})

describe('normalize', () => {
  it('rebases a series to 0% at the first point', () => {
    const n = normalize([100, 110, 120])
    expect(n[0]).toBe(0)
    expect(n[1]).toBeCloseTo(10)
    expect(n[2]).toBeCloseTo(20)
  })
  it('is empty for empty input', () => {
    expect(normalize([])).toEqual([])
  })
})
