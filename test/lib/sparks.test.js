import { describe, it, expect } from 'vitest'
import {
  SPARK_TYPES, DEFAULT_SPARK, isSparkType, linePoints, changeBars, rangeBars,
  SPARK_WINDOWS, DEFAULT_WINDOW, isSparkWindow, sparkWindow, bucketBars,
  historyBarsToSparkBars, normalizeSparkWindow,
} from '../../src/lib/sparks.js'

const bar = (c, h, l, v, up) => ({ c, h, l, v, up })

describe('spark windows', () => {
  it('offers unique ids in ascending length and names the default', () => {
    const ids = SPARK_WINDOWS.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_WINDOW)
    const lens = SPARK_WINDOWS.map((w) => w.sessions)
    expect([...lens].sort((a, b) => a - b)).toEqual(lens)
    expect(ids).toEqual(['DAY', '1M', '3M', '6M', '1Y'])
  })
  it('validates ids', () => {
    expect(isSparkWindow('6M')).toBe(true)
    expect(isSparkWindow('1W')).toBe(false)
    expect(isSparkWindow('2W')).toBe(false)
    expect(isSparkWindow('5Y')).toBe(false)
  })
  it('migrates retired short windows to the first useful daily horizon', () => {
    expect(normalizeSparkWindow('1W')).toBe('1M')
    expect(normalizeSparkWindow('2W')).toBe('1M')
    expect(normalizeSparkWindow('3M')).toBe('3M')
    expect(normalizeSparkWindow('nonsense')).toBe(DEFAULT_WINDOW)
  })
  it('takes the tail of the series', () => {
    const bars = Array.from({ length: 252 }, (_, i) => bar(i))
    expect(sparkWindow(bars, '1M')).toHaveLength(21)
    expect(sparkWindow(bars, '1M')[20].c).toBe(251)
    expect(sparkWindow(bars, '1Y')).toHaveLength(252)
  })
  it('falls back to the default window on an unknown id', () => {
    const bars = Array.from({ length: 252 }, (_, i) => bar(i))
    expect(sparkWindow(bars, 'nonsense')).toHaveLength(126)
  })
  it('returns everything it has when the window is longer than the series', () => {
    expect(sparkWindow([bar(1), bar(2)], '1Y')).toHaveLength(2)
    expect(sparkWindow(null, '1M')).toEqual([])
    expect(sparkWindow([bar(1), bar(2), bar(3)], 'DAY')).toHaveLength(3)
  })
})

describe('intraday spark normalization', () => {
  it('maps chart bars into the shared spark shape and derives direction', () => {
    expect(historyBarsToSparkBars([
      { close: 10, high: 11, low: 9, volume: 100 },
      { close: 9, high: 10, low: 8, volume: 200 },
    ])).toEqual([
      { c: 10, h: 11, l: 9, v: 100, up: true },
      { c: 9, h: 10, l: 8, v: 200, up: false },
    ])
  })
})

describe('bucketBars', () => {
  it('passes short series through untouched', () => {
    const bars = [bar(1), bar(2)]
    expect(bucketBars(bars, 60)).toBe(bars)
  })
  it('sums volume and spans the range inside each bucket', () => {
    const bars = [
      bar(10, 12, 8, 100), bar(11, 14, 9, 200),
      bar(9, 10, 5, 50), bar(8, 9, 4, 70),
    ]
    const out = bucketBars(bars, 2)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ v: 300, c: 11, h: 14, l: 8 })
    expect(out[1]).toMatchObject({ v: 120, c: 8, h: 10, l: 4 })
  })
  it('colours a bucket against the previous bucket close', () => {
    const bars = [bar(10), bar(11), bar(12), bar(9)]
    const out = bucketBars(bars, 2)
    expect(out[0].up).toBe(true)   // 11 vs its own opening 10
    expect(out[1].up).toBe(false)  // 9 vs 11
  })
  it('never leaves more buckets than asked for', () => {
    const bars = Array.from({ length: 252 }, (_, i) => bar(i, i, i, 1))
    expect(bucketBars(bars, 60).length).toBeLessThanOrEqual(60)
  })
})

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
