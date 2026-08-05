import { describe, expect, it } from 'vitest'
import { TICK_FLASH_MS, tickFlashDirection } from '../../src/lib/tickFlash.js'

describe('tickFlashDirection', () => {
  it('classifies later visible live prints', () => {
    expect(tickFlashDirection(100, 101, { now: 2_000 })).toBe('up')
    expect(tickFlashDirection(101, 100, { now: 2_000 })).toBe('down')
  })

  it('does not paint initial, unchanged, hidden, or resume-baseline prices', () => {
    expect(tickFlashDirection(null, 100, { now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 100, { now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 101, { baselinePending: true, now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 101, { hidden: true, now: 2_000 })).toBeNull()
  })

  it('holds the solid paint longer than the old one-second block', () => {
    expect(TICK_FLASH_MS).toBe(1350)
  })
})
