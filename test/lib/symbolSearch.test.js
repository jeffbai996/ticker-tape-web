import { describe, expect, it } from 'vitest'
import { parseSymbolSearch } from '../../src/lib/symbolSearch.js'

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
