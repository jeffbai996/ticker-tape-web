import { describe, it, expect } from 'vitest'
import { vwapSeries } from '../../src/lib/vwap.js'

describe('vwapSeries', () => {
  it('equals the typical price on the first bar', () => {
    const bars = [{ time: 1, high: 12, low: 8, close: 10, volume: 100 }]
    expect(vwapSeries(bars)).toEqual([{ time: 1, value: 10 }])
  })

  it('volume-weights across bars', () => {
    const bars = [
      { time: 1, high: 10, low: 10, close: 10, volume: 100 },   // tp 10
      { time: 2, high: 20, low: 20, close: 20, volume: 300 },   // tp 20
    ]
    // (10*100 + 20*300) / 400 = 17.5
    const out = vwapSeries(bars)
    expect(out[1].value).toBeCloseTo(17.5)
  })

  it('skips zero/missing-volume bars but keeps the running level', () => {
    const bars = [
      { time: 1, high: 10, low: 10, close: 10, volume: 100 },
      { time: 2, high: 50, low: 50, close: 50, volume: 0 },
      { time: 3, high: 10, low: 10, close: 10, volume: 100 },
    ]
    const out = vwapSeries(bars)
    expect(out).toHaveLength(3)
    expect(out[1].value).toBeCloseTo(10)   // unchanged by the zero-volume bar
    expect(out[2].value).toBeCloseTo(10)
  })

  it('returns empty for empty input', () => {
    expect(vwapSeries([])).toEqual([])
  })
})
