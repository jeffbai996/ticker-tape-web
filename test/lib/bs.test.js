import { describe, it, expect } from 'vitest'
import { normCdf, bsDelta } from '../../src/lib/bs.js'

describe('normCdf', () => {
  it('is 0.5 at zero', () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 5)
  })
  it('matches known values', () => {
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3)
    expect(normCdf(-1.96)).toBeCloseTo(0.025, 3)
  })
})

describe('bsDelta', () => {
  const S = 100
  const T = 30 / 365
  const iv = 0.3
  const r = 0.04

  it('ATM call delta is a bit above 0.5', () => {
    const d = bsDelta({ spot: S, strike: 100, t: T, iv, rate: r, type: 'call' })
    expect(d).toBeGreaterThan(0.5)
    expect(d).toBeLessThan(0.6)
  })

  it('deep ITM call approaches 1, deep OTM approaches 0', () => {
    expect(bsDelta({ spot: S, strike: 50, t: T, iv, rate: r, type: 'call' })).toBeGreaterThan(0.99)
    expect(bsDelta({ spot: S, strike: 200, t: T, iv, rate: r, type: 'call' })).toBeLessThan(0.01)
  })

  it('put delta = call delta - 1', () => {
    const c = bsDelta({ spot: S, strike: 100, t: T, iv, rate: r, type: 'call' })
    const p = bsDelta({ spot: S, strike: 100, t: T, iv, rate: r, type: 'put' })
    expect(p).toBeCloseTo(c - 1, 10)
  })

  it('returns null on degenerate inputs', () => {
    expect(bsDelta({ spot: 0, strike: 100, t: T, iv, rate: r, type: 'call' })).toBeNull()
    expect(bsDelta({ spot: S, strike: 100, t: 0, iv, rate: r, type: 'call' })).toBeNull()
    expect(bsDelta({ spot: S, strike: 100, t: T, iv: 0, rate: r, type: 'call' })).toBeNull()
  })
})
