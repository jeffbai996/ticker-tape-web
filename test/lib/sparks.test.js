import { describe, it, expect } from 'vitest'
import {
  SPARK_TYPES, DEFAULT_SPARK, isSparkType, linePoints, changeBars, rangeBars,
} from '../../src/lib/sparks.js'

const bar = (c, h, l, v, up) => ({ c, h, l, v, up })

describe('spark type registry', () => {
  it('offers unique ids and names the default among them', () => {
    const ids = SPARK_TYPES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_SPARK)
  })
  it('validates ids so a stale localStorage pick can be rejected', () => {
    expect(isSparkType('line')).toBe(true)
    expect(isSparkType('candles')).toBe(false)
    expect(isSparkType(undefined)).toBe(false)
  })
})

describe('linePoints', () => {
  it('spans the full width and inverts the y axis', () => {
    const line = linePoints([bar(10), bar(20), bar(30)], 100, 20)
    expect(line.points).toBe('0.00,19.00 50.00,10.00 100.00,1.00')
    expect(line.up).toBe(true)
  })
  it('marks a down window', () => {
    expect(linePoints([bar(30), bar(10)], 100, 20).up).toBe(false)
  })
  it('draws a flat series down the middle instead of on the floor', () => {
    const line = linePoints([bar(5), bar(5), bar(5)], 100, 20)
    expect(line.points).toBe('0.00,10.00 50.00,10.00 100.00,10.00')
    expect(line.up).toBe(true)
  })
  it('reports where the window opened', () => {
    expect(linePoints([bar(10), bar(30)], 100, 20).baseline).toBeCloseTo(19)
  })
  it('returns null without two closes to join', () => {
    expect(linePoints([bar(10)], 100, 20)).toBeNull()
    expect(linePoints([], 100, 20)).toBeNull()
    expect(linePoints(null, 100, 20)).toBeNull()
  })
})

describe('changeBars', () => {
  it('measures close over close, one bar short of the input', () => {
    const out = changeBars([bar(100), bar(110), bar(99)])
    expect(out).toHaveLength(2)
    expect(out[0].pct).toBeCloseTo(10)
    expect(out[0].up).toBe(true)
    expect(out[1].pct).toBeCloseTo(-10)
    expect(out[1].up).toBe(false)
  })
  it('scales every bar against the window\'s biggest move', () => {
    const out = changeBars([bar(100), bar(110), bar(104.5)])
    expect(out[0].frac).toBeCloseTo(1)
    expect(out[1].frac).toBeCloseTo(0.5)
  })
  it('is empty when there is nothing to difference', () => {
    expect(changeBars([bar(100)])).toEqual([])
    expect(changeBars(null)).toEqual([])
  })
})

describe('rangeBars', () => {
  it('places each session inside the window range', () => {
    const out = rangeBars([bar(null, 20, 10), bar(null, 30, 25)])
    expect(out[0].lo).toBeCloseTo(0)
    expect(out[0].hi).toBeCloseTo(0.5)
    expect(out[1].lo).toBeCloseTo(0.75)
    expect(out[1].hi).toBeCloseTo(1)
  })
  it('skips bars with no high/low and survives a flat window', () => {
    const out = rangeBars([bar(null, null, null), bar(null, 5, 5)])
    expect(out).toHaveLength(1)
    expect(out[0].lo).toBeCloseTo(0.5)
    expect(out[0].hi).toBeCloseTo(0.5)
  })
  it('is empty with no usable bars', () => {
    expect(rangeBars([])).toEqual([])
    expect(rangeBars(null)).toEqual([])
  })
})
