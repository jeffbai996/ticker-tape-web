import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TICK_FLASH_MS,
  metricFlashDirection,
  tickFlashDirection,
} from '../../src/lib/tickFlash.js'

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

  it('paints daily-change metrics in the direction of the live tick', () => {
    expect(metricFlashDirection(1.2, 1.3, { kind: 'change' })).toBe('up')
    expect(metricFlashDirection(-1.2, -1.3, { kind: 'change' })).toBe('down')
  })

  it('paints only genuine new session extremes', () => {
    expect(metricFlashDirection(101, 102, { kind: 'high' })).toBe('up')
    expect(metricFlashDirection(102, 101, { kind: 'high' })).toBeNull()
    expect(metricFlashDirection(99, 98, { kind: 'low' })).toBe('down')
    expect(metricFlashDirection(98, 99, { kind: 'low' })).toBeNull()
  })

  it('keeps every metric quiet during hidden and resume-baseline updates', () => {
    expect(metricFlashDirection(1, 2, { kind: 'change', hidden: true })).toBeNull()
    expect(metricFlashDirection(100, 101, { kind: 'high', baselinePending: true })).toBeNull()
  })

  it('keeps percentage figures as colored text without inverse-video boxes', () => {
    const files = [
      'src/components/Tape.jsx',
      'src/pages/dashboard.jsx',
      'src/pages/markets.jsx',
      'src/pages/research.jsx',
      'src/pages/screen.jsx',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8')).join('\n')

    expect(files).not.toMatch(/<FlashMetric[^>]+fmt=\{fmtPct\}/)
    expect(files).toContain('<FlashPrice price={q.price} fmt={fmtPrice} />')
    expect(files).toContain('<FlashMetric value={q.change} fmt={fmtChange} />')
  })
})
