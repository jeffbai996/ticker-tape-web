import { describe, expect, it } from 'vitest'
import { boundedTimeScale, marketTimeLabel } from '../../src/lib/chartview.js'

describe('boundedTimeScale', () => {
  it('keeps zoom and pan inside the loaded history', () => {
    expect(boundedTimeScale(false)).toMatchObject({
      fixLeftEdge: true,
      fixRightEdge: true,
      rightOffset: 0,
      lockVisibleTimeRangeOnResize: true,
      timeVisible: false,
    })
    expect(boundedTimeScale(true).timeVisible).toBe(true)
  })

  it('labels intraday timestamps in New York market time', () => {
    const timestamp = Date.parse('2026-08-12T20:30:32Z') / 1000
    expect(marketTimeLabel(timestamp)).toBe('16:30')
    expect(boundedTimeScale(true).tickMarkFormatter(timestamp)).toBe('16:30')
    expect(boundedTimeScale(false).tickMarkFormatter).toBeUndefined()
  })
})
