import { describe, it, expect } from 'vitest'
import { lastSessionBars } from '../../src/lib/history.js'


describe('lastSessionBars', () => {
  // Yahoo's 1d window intermittently returns a quote and ZERO bars while 5d
  // still carries today's prints — the 1D chart went blank (2026-08-06)
  const et = (iso) => Math.floor(new Date(iso).getTime() / 1000)
  const bars = [
    { time: et('2026-08-05T13:30:00Z'), close: 1 },
    { time: et('2026-08-05T20:00:00Z'), close: 2 },
    { time: et('2026-08-06T13:30:00Z'), close: 3 },
    { time: et('2026-08-06T14:00:00Z'), close: 4 },
  ]
  it('keeps only the newest ET session', () => {
    const out = lastSessionBars(bars)
    expect(out.map((b) => b.close)).toEqual([3, 4])
  })
  it('survives empty input', () => {
    expect(lastSessionBars([])).toEqual([])
    expect(lastSessionBars(null)).toEqual([])
  })
})
