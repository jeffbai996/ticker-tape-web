import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lastSessionBars, fetchHistory } from '../../src/lib/history.js'


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


describe('fetchHistory extended hours', () => {
  const chart = (n) => ({
    chart: {
      result: [{
        meta: { regularMarketPrice: 10, previousClose: 9 },
        timestamp: Array.from({ length: n }, (_, i) => 1_760_000_000 + i * 300),
        indicators: {
          quote: [{
            open: Array(n).fill(10), high: Array(n).fill(11),
            low: Array(n).fill(9), close: Array(n).fill(10), volume: Array(n).fill(100),
          }],
        },
      }],
    },
  })

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => chart(5) }))
  })

  it('asks Yahoo for the extended session only when the toggle is on', async () => {
    await fetchHistory('EXTA', '1D', { prepost: true })
    expect(globalThis.fetch.mock.calls[0][0]).toContain('includePrePost=true')

    globalThis.fetch.mockClear()
    await fetchHistory('EXTB', '1D')
    expect(globalThis.fetch.mock.calls[0][0]).not.toContain('includePrePost')
  })

  it('caches the two sessions separately so toggling refetches', async () => {
    await fetchHistory('EXTC', '1D')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    await fetchHistory('EXTC', '1D')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)   // served from cache
    await fetchHistory('EXTC', '1D', { prepost: true })
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)   // different series
  })

  it('ignores the flag on daily ranges, which have no session split', async () => {
    await fetchHistory('EXTD', '1Y', { prepost: true })
    expect(globalThis.fetch.mock.calls[0][0]).not.toContain('includePrePost')
  })
})
