import { describe, expect, it } from 'vitest'
import { RAIL_LIMITS, railWidthAtDrag, validRailWidth } from '../../src/lib/railResize.js'

describe('railWidthAtDrag', () => {
  it('keeps a visible rail within its usable bounds', () => {
    expect(railWidthAtDrag(208, 140, RAIL_LIMITS.left)).toBe(348)
    expect(railWidthAtDrag(208, 900, RAIL_LIMITS.left)).toBe(RAIL_LIMITS.left.max)
    expect(railWidthAtDrag(208, -90, RAIL_LIMITS.left)).toBe(RAIL_LIMITS.left.min)
  })

  it('collapses when the handle reaches the outer edge instead of leaving a sliver', () => {
    expect(railWidthAtDrag(208, -208, RAIL_LIMITS.left)).toBe(0)
    expect(railWidthAtDrag(230, -230, RAIL_LIMITS.right)).toBe(0)
  })

  it('rejects corrupt stored widths while retaining an intentional collapsed state', () => {
    expect(validRailWidth(null, RAIL_LIMITS.left)).toBeNull()
    expect(validRailWidth(0, RAIL_LIMITS.left)).toBe(0)
    expect(validRailWidth(208, RAIL_LIMITS.left)).toBe(208)
    expect(validRailWidth(20, RAIL_LIMITS.left)).toBeNull()
    expect(validRailWidth(999, RAIL_LIMITS.left)).toBeNull()
  })
})
