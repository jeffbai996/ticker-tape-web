import { describe, expect, it } from 'vitest'
import {
  RESUME_FLASH_QUIET_MS, TICK_FLASH_MS, tickFlashDirection,
} from '../../src/lib/tickFlash.js'

describe('tickFlashDirection', () => {
  it('classifies later visible live prints', () => {
    expect(tickFlashDirection(100, 101, { now: 2_000 })).toBe('up')
    expect(tickFlashDirection(101, 100, { now: 2_000 })).toBe('down')
  })

  it('does not paint initial, unchanged, hidden, baseline, or just-resumed prices', () => {
    expect(tickFlashDirection(null, 100, { now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 100, { now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 101, { baselinePending: true, now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 101, { hidden: true, now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 101, { now: 2_000, quietUntil: 2_001 })).toBeNull()
  })

  it('holds paint longer than the old one-second block and uses a short resume grace', () => {
    expect(TICK_FLASH_MS).toBe(1350)
    expect(RESUME_FLASH_QUIET_MS).toBe(1500)
  })
})
