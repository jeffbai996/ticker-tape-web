import { describe, expect, it } from 'vitest'
import { chatMetrics, metricDuration } from '../../src/lib/chatMetrics.js'

describe('chat response footer', () => {
  it('distinguishes missing telemetry from measured zero', () => {
    expect(chatMetrics({}).output).toBeNull()
    expect(chatMetrics({ usage: { in: 0, out: 0 }, startedAt: 1000, now: 2000 }).rate).toBe(0)
    expect(chatMetrics({ usage: { out: NaN } }).output).toBeNull()
  })
  it('freezes completed timing on history reload and counts whole-turn throughput', () => {
    const m = chatMetrics({ usage: { in: 100, out: 4977 }, startedAt: 1000, endedAt: 189000, now: 999999 })
    expect(m.elapsed).toBe(188)
    expect(m.rate).toBeCloseTo(26.47, 2)
    expect(metricDuration(m.elapsed)).toBe('3m 8s')
  })
  it('avoids infinity, negative durations and fabricated rates', () => {
    expect(chatMetrics({ usage: { out: 100 }, startedAt: 1000, now: 1000 }).rate).toBeNull()
    expect(chatMetrics({ startedAt: 2000, now: 1000 }).elapsed).toBe(0)
    expect(chatMetrics({ startedAt: 1000, now: 5000 }).rate).toBeNull()
    expect(metricDuration(null)).toBe('—')
    expect(metricDuration(3661)).toBe('1h 1m')
  })
})
