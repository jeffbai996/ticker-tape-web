import { describe, expect, it } from 'vitest'
import { boundedTimeScale } from '../../src/lib/chartview.js'

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
})
