import { describe, it, expect } from 'vitest'
import { segmentDistance, nearestDrawing } from '../src/lib/chartmath.js'

describe('segmentDistance', () => {
  it('is zero on the segment', () => {
    expect(segmentDistance(5, 0, 0, 0, 10, 0)).toBe(0)
    expect(segmentDistance(5, 5, 0, 0, 10, 10)).toBeCloseTo(0)
  })

  it('measures perpendicular distance inside the span', () => {
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBe(3)
  })

  it('clamps to the endpoints beyond the span, not the infinite line', () => {
    // straight off the right end: 5px past x=10, so 5 away — an infinite-line
    // distance would call this 0 and select a line the user isn't near
    expect(segmentDistance(15, 0, 0, 0, 10, 0)).toBe(5)
    expect(segmentDistance(-3, 4, 0, 0, 10, 0)).toBe(5)
  })

  it('handles a degenerate zero-length segment', () => {
    expect(segmentDistance(3, 4, 0, 0, 0, 0)).toBe(5)
  })
})

describe('nearestDrawing', () => {
  const shapes = [
    { id: 'a', kind: 'h', y: 100 },
    { id: 'b', kind: 'seg', x1: 0, y1: 0, x2: 100, y2: 0 },
  ]

  it('finds a horizontal line by vertical distance only', () => {
    expect(nearestDrawing(shapes, 999, 104, 12)?.id).toBe('a')
  })

  it('finds a segment by perpendicular distance', () => {
    expect(nearestDrawing(shapes, 50, 5, 12)?.id).toBe('b')
  })

  it('returns null when nothing is within the tolerance', () => {
    expect(nearestDrawing(shapes, 50, 50, 12)).toBeNull()
  })

  it('picks the closer of two candidates', () => {
    const close = [{ id: 'a', kind: 'h', y: 100 }, { id: 'c', kind: 'h', y: 96 }]
    expect(nearestDrawing(close, 10, 97, 12)?.id).toBe('c')
  })

  it('skips shapes with no usable coordinates', () => {
    expect(nearestDrawing([{ id: 'z', kind: 'h', y: null }], 0, 0, 12)).toBeNull()
    expect(nearestDrawing([{ id: 'z', kind: 'seg' }], 0, 0, 12)).toBeNull()
    expect(nearestDrawing(null, 0, 0, 12)).toBeNull()
  })
})
