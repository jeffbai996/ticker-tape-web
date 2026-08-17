import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lastSessionBars, latestSessionBars, fetchHistory, indicatorWarmRange, RANGES } from '../../src/lib/history.js'


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

describe('two-session chart range', () => {
  const et = (iso) => Math.floor(new Date(iso).getTime() / 1000)
  const bars = [
    { time: et('2026-08-07T20:00:00Z'), close: 1 },
    { time: et('2026-08-10T08:00:00Z'), close: 2 },
    { time: et('2026-08-10T08:01:00Z'), close: 3 },
    { time: et('2026-08-10T08:02:00Z'), close: 4 },
  ]

  it('keeps the latest two exchange dates across a weekend', () => {
    expect(latestSessionBars(bars, 2).map((bar) => bar.close)).toEqual([1, 2, 3, 4])
  })

  it('replaces the visible 1D range with a 5d-backed 2D range', () => {
    expect(RANGES[0]).toMatchObject({ key: '2D', range: '5d', sessions: 2 })
    expect(RANGES.some((range) => range.key === '1D')).toBe(false)
  })
})

describe('indicatorWarmRange', () => {
  it('loads enough same-interval history for a 200-period average', () => {
    expect(indicatorWarmRange('1m')).toBe('5d')
    expect(indicatorWarmRange('15m')).toBe('1mo')
    expect(indicatorWarmRange('1h')).toBe('3mo')
    expect(indicatorWarmRange('4h')).toBe('1y')
    expect(indicatorWarmRange('1d')).toBe('1y')
    expect(indicatorWarmRange('1wk')).toBe('5y')
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

  it('backs the 2D window with five days of intraday data', async () => {
    await fetchHistory('TWOD', '2D', { prepost: true })
    expect(globalThis.fetch.mock.calls[0][0]).toContain('range=5d&interval=5m')
    expect(globalThis.fetch.mock.calls[0][0]).toContain('includePrePost=true')
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

  it('fetches a full year to warm a daily SMA 200', async () => {
    await fetchHistory('WARM200', '1M', { warm: true })
    expect(globalThis.fetch.mock.calls[0][0]).toContain('range=1y&interval=1d')
  })
})

describe('rangeReturn', () => {
  it('returns % change from the first bar of the visible range to the current price, labelled by the range key (Jeff 2026-08-17: the descriptor said YTD on a 2D chart)', async () => {
    const { rangeReturn } = await import('../../src/lib/history.js')
    const bars = [{ time: 1, close: 100 }, { time: 2, close: 105 }, { time: 3, close: 110 }]
    expect(rangeReturn(bars, 121, '2D')).toEqual({ label: '2D', pct: 21 })
    expect(rangeReturn(bars, 121, 'YTD')).toEqual({ label: 'YTD', pct: 21 })
    expect(rangeReturn([], 121, '1M')).toEqual({ label: '1M', pct: null })
    expect(rangeReturn(bars, null, '1M')).toEqual({ label: '1M', pct: null })
  })
})
