import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { parseOptionsResponse, moneyness, atmIndex, fetchOptionsChain, _clearCacheForTests, isOptionsAvailable } from '../../src/lib/options.js'

// Minimal Yahoo v7 options response shape
const fixture = {
  optionChain: {
    result: [{
      underlyingSymbol: 'NVDA',
      quote: { regularMarketPrice: 200, shortName: 'NVIDIA Corp' },
      expirationDates: [1800000000, 1801000000],
      strikes: [180, 190, 200, 210],
      options: [{
        expirationDate: 1800000000,
        calls: [
          { contractSymbol: 'NVDA-C-180', strike: 180, bid: 21, ask: 22, lastPrice: 21.5,
            volume: 100, openInterest: 500, impliedVolatility: 0.35, inTheMoney: true },
          { contractSymbol: 'NVDA-C-200', strike: 200, bid: 8, ask: 8.5, lastPrice: 8.2,
            volume: 1000, openInterest: 2000, impliedVolatility: 0.30, inTheMoney: false },
        ],
        puts: [
          { contractSymbol: 'NVDA-P-200', strike: 200, bid: 7, ask: 7.5, lastPrice: 7.2,
            volume: 800, openInterest: 1500, impliedVolatility: 0.32, inTheMoney: false },
        ],
      }],
    }],
  },
}

describe('parseOptionsResponse', () => {
  it('returns null for empty / invalid response', () => {
    expect(parseOptionsResponse(null)).toBeNull()
    expect(parseOptionsResponse({})).toBeNull()
    expect(parseOptionsResponse({ optionChain: {} })).toBeNull()
    expect(parseOptionsResponse({ optionChain: { result: [] } })).toBeNull()
  })

  it('parses underlying + expirations + strikes', () => {
    const out = parseOptionsResponse(fixture)
    expect(out.underlying.symbol).toBe('NVDA')
    expect(out.underlying.price).toBe(200)
    expect(out.underlying.name).toBe('NVIDIA Corp')
    expect(out.expirations).toEqual([1800000000, 1801000000])
    expect(out.strikes).toEqual([180, 190, 200, 210])
    expect(out.selectedExpiry).toBe(1800000000)
  })

  it('enriches contracts with moneyness', () => {
    const out = parseOptionsResponse(fixture)
    expect(out.calls).toHaveLength(2)
    expect(out.puts).toHaveLength(1)
    const atmCall = out.calls.find(c => c.strike === 200)
    expect(atmCall.moneyness).toBe(0)
    expect(atmCall.bid).toBe(8)
    const itmCall = out.calls.find(c => c.strike === 180)
    expect(itmCall.moneyness).toBe(-10) // (180-200)/200*100
  })

  it('survives missing chain fields', () => {
    const minimal = { optionChain: { result: [{ underlyingSymbol: 'X', quote: {}, expirationDates: [], options: [] }] } }
    const out = parseOptionsResponse(minimal)
    expect(out.calls).toEqual([])
    expect(out.puts).toEqual([])
    expect(out.selectedExpiry).toBeNull()
    expect(out.underlying.price).toBeNull()
  })
})

describe('moneyness', () => {
  it('returns 0 when strike equals price', () => {
    expect(moneyness(100, 100)).toBe(0)
  })
  it('returns negative when strike below price', () => {
    expect(moneyness(90, 100)).toBe(-10)
  })
  it('returns positive when strike above price', () => {
    expect(moneyness(110, 100)).toBe(10)
  })
  it('returns null for invalid price', () => {
    expect(moneyness(100, 0)).toBeNull()
    expect(moneyness(100, null)).toBeNull()
    expect(moneyness(null, 100)).toBeNull()
  })
})

describe('atmIndex', () => {
  it('finds nearest strike to price', () => {
    const cs = [{ strike: 90 }, { strike: 100 }, { strike: 110 }]
    expect(atmIndex(cs, 101)).toBe(1)
    expect(atmIndex(cs, 105)).toBe(1) // tie breaks to first
    expect(atmIndex(cs, 109)).toBe(2)
  })
  it('returns -1 for empty list or missing price', () => {
    expect(atmIndex([], 100)).toBe(-1)
    expect(atmIndex([{ strike: 100 }], null)).toBe(-1)
  })
})

describe('fetchOptionsChain', () => {
  beforeEach(() => {
    localStorage.clear()
    _clearCacheForTests()
    globalThis.fetch = vi.fn()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns null when proxy_url is unset', async () => {
    expect(isOptionsAvailable()).toBe(false)
    const out = await fetchOptionsChain('NVDA')
    expect(out).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('calls /v7/finance/options/{SYM} via proxy_url', async () => {
    localStorage.setItem('proxy_url', 'https://proxy.example.com/')
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
    const out = await fetchOptionsChain('NVDA')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const url = globalThis.fetch.mock.calls[0][0]
    expect(url).toBe('https://proxy.example.com/v7/finance/options/NVDA')
    expect(out.underlying.symbol).toBe('NVDA')
  })

  it('appends date= when expiryTs is given', async () => {
    localStorage.setItem('proxy_url', 'https://proxy.example.com')
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
    await fetchOptionsChain('NVDA', 1800000000)
    const url = globalThis.fetch.mock.calls[0][0]
    expect(url).toBe('https://proxy.example.com/v7/finance/options/NVDA?date=1800000000')
  })

  it('caches successive calls within TTL', async () => {
    localStorage.setItem('proxy_url', 'https://proxy.example.com')
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => fixture })
    await fetchOptionsChain('NVDA')
    await fetchOptionsChain('NVDA')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it('returns null on HTTP error', async () => {
    localStorage.setItem('proxy_url', 'https://proxy.example.com')
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500 })
    const out = await fetchOptionsChain('NVDA')
    expect(out).toBeNull()
  })

  it('returns null on network throw', async () => {
    localStorage.setItem('proxy_url', 'https://proxy.example.com')
    globalThis.fetch.mockRejectedValueOnce(new Error('network'))
    const out = await fetchOptionsChain('NVDA')
    expect(out).toBeNull()
  })
})
