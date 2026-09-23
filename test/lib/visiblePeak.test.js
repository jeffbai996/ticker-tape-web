import { describe, expect, it } from 'vitest'
import { peakInRange } from '../../src/lib/visiblePeak.js'

const bars = [10, 40, 20, 35].map((high, time) => ({ time, high }))

describe('peak in the visible chart window', () => {
  it('changes with pan and excludes clipped edge bars', () => {
    expect(peakInRange(bars, { from: 0, to: 3 })).toBe(bars[1])
    expect(peakInRange(bars, { from: 1.2, to: 3 })).toBe(bars[3])
    expect(peakInRange(bars, { from: -9, to: 0.8 })).toBe(bars[0])
    expect(peakInRange(bars, { from: 4, to: 8 })).toBeNull()
  })
})
