// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { cushionCls, cushionBarCls, CUSHION_LOW } from '../../src/lib/cushion.js'

describe('cushion display classes (A31 F4)', () => {
  it('an unknown cushion is muted — never the safe color', () => {
    expect(cushionCls(undefined)).toBe('text-muted')
    expect(cushionCls(null)).toBe('text-muted')
    expect(cushionCls(NaN)).toBe('text-muted')
    expect(cushionBarCls(undefined)).toBe('bg-ink-2/40')
  })

  it('a known cushion keeps the danger/safe split at the low threshold', () => {
    expect(cushionCls(CUSHION_LOW - 1)).toBe('text-down')
    expect(cushionCls(CUSHION_LOW)).toBe('text-up')
    expect(cushionBarCls(CUSHION_LOW - 1)).toBe('bg-down')
    expect(cushionBarCls(CUSHION_LOW)).toBe('bg-up/70')
  })
})
