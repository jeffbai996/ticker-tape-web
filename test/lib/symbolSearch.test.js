import { describe, expect, it, vi } from 'vitest'
import { parseSymbolSearch, symbolExists } from '../../src/lib/symbolSearch.js'

const payload = {
  quotes: [
    { symbol: 'SKHY', quoteType: 'EQUITY', shortname: 'SK hynix Inc.', longname: 'SK hynix Inc.', exchDisp: 'NASDAQ' },
    { symbol: '000660.KS', quoteType: 'EQUITY', shortname: 'SK hynix', exchDisp: 'Korea' },
    { symbol: 'HXSCL', quoteType: 'EQUITY', shortname: 'SK hynix ADR', exchDisp: 'OTC' },
    { symbol: 'SKHY26', quoteType: 'OPTION', shortname: 'call', exchDisp: 'OPR' },
    { symbol: 'HYNIX-USD', quoteType: 'CRYPTOCURRENCY', shortname: 'scamcoin', exchDisp: 'CCC' },
    { symbol: 'QQQ', quoteType: 'ETF', shortname: 'Invesco QQQ', exchDisp: 'NASDAQ' },
  ],
}

describe('parseSymbolSearch', () => {
  it('keeps equities and ETFs across venues, in api order', () => {
    const out = parseSymbolSearch(payload)
    expect(out.map((r) => r.symbol)).toEqual(['SKHY', '000660.KS', 'HXSCL', 'QQQ'])
    expect(out[0]).toMatchObject({ name: 'SK hynix Inc.', exch: 'NASDAQ' })
  })

  it('drops options and crypto — not navigable research pages', () => {
    const syms = parseSymbolSearch(payload).map((r) => r.symbol)
    expect(syms).not.toContain('SKHY26')
    expect(syms).not.toContain('HYNIX-USD')
  })

  it('survives an empty or malformed payload', () => {
    expect(parseSymbolSearch({})).toEqual([])
    expect(parseSymbolSearch(null)).toEqual([])
  })
})

describe('symbolExists', () => {
  // typing junk used to navigate anyway and land on a dead research page
  const search = (rows) => vi.fn(async () => rows)

  it('accepts an exact provider match, case-insensitively', async () => {
    const hit = search([{ symbol: 'NVDA', name: 'NVIDIA Corporation' }])
    expect(await symbolExists('nvda', { search: hit })).toBe(true)
    expect(hit).toHaveBeenCalledOnce()
  })

  it('rejects a string the provider only matches by name', async () => {
    const near = search([{ symbol: 'AAPL', name: 'Apple Inc.' }])
    expect(await symbolExists('APPLE', { search: near })).toBe(false)
  })

  it('rejects a bare number without asking anyone', async () => {
    const never = search([{ symbol: '13455' }])
    expect(await symbolExists('13455', { search: never })).toBe(false)
    expect(never).not.toHaveBeenCalled()
  })

  it('answers instantly for a symbol already in the cache', async () => {
    const never = search([])
    const cached = (s) => (s === 'MU' ? { price: 100 } : null)
    expect(await symbolExists('mu', { cached, search: never })).toBe(true)
    expect(never).not.toHaveBeenCalled()
  })

  it('still checks suffixed foreign codes that contain digits', async () => {
    const hit = search([{ symbol: '7203.T', name: 'Toyota' }])
    expect(await symbolExists('7203.T', { search: hit })).toBe(true)
    expect(hit).toHaveBeenCalledOnce()
  })

  it('is false for empty input and propagates lookup failures', async () => {
    expect(await symbolExists('  ', { search: search([]) })).toBe(false)
    const boom = vi.fn(async () => { throw new Error('offline') })
    await expect(symbolExists('NVDA', { search: boom })).rejects.toThrow('offline')
  })
})
