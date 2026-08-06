import { describe, expect, it } from 'vitest'
import { extendedLabelClass } from '../../src/lib/extendedHours.js'

describe('extendedLabelClass', () => {
  it('uses distinct session colors for overnight, pre-market, and after-hours', () => {
    // lemon, not the UI amber — ON in accent read as chrome (Jeff 2026-08-05)
    expect(extendedLabelClass('ON')).toBe('text-[#fde047]')
    expect(extendedLabelClass('PM')).toBe('text-[#5ba8d9]')
    expect(extendedLabelClass('AH')).toBe('text-[#c084fc]')
  })

  it('keeps unknown provider labels legible', () => {
    expect(extendedLabelClass('UNKNOWN')).toBe('text-ink-2')
  })
})
