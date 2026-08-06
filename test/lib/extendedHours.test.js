import { describe, expect, it } from 'vitest'
import { extendedLabelClass } from '../../src/lib/extendedHours.js'

describe('extendedLabelClass', () => {
  it('uses distinct session colors for overnight, pre-market, and after-hours', () => {
    expect(extendedLabelClass('ON')).toBe('text-accent')
    expect(extendedLabelClass('PM')).toBe('text-[#5ba8d9]')
    expect(extendedLabelClass('AH')).toBe('text-[#c084fc]')
  })

  it('keeps unknown provider labels legible', () => {
    expect(extendedLabelClass('UNKNOWN')).toBe('text-ink-2')
  })
})
