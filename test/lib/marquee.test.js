import { describe, expect, it } from 'vitest'
import { marqueeCopies } from '../../src/lib/marquee.js'

describe('marqueeCopies', () => {
  it('keeps one complete spare cycle beyond the viewport', () => {
    expect(marqueeCopies(390, 100)).toBe(5)
    expect(marqueeCopies(390, 500)).toBe(2)
  })

  it('falls back to two cycles until the belt is measurable', () => {
    expect(marqueeCopies(390, 0)).toBe(2)
    expect(marqueeCopies(0, 100)).toBe(2)
  })
})
