// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { familyEventTier, selectNewsPortfolios } from '../../src/lib/familyWireRelevance.js'
const profile = {
  holdings: [{ symbol:'AAPL', names:['Apple Inc.','苹果公司'], category:'Megacaps' }],
  watched: [{ symbol:'MSFT', names:['Microsoft Corporation','微软'] }],
}
const event = (headline, extra={}) => ({ headline, ...extra })

describe('family news relevance', () => {
  it('uses configured books only, including separate currency books', () => {
    const books=[{id:'p1'},{id:'p2'},{id:'p3'}]
    expect(selectNewsPortfolios(books,'p1,p2','p3')).toEqual(books.slice(0,2))
    expect(selectNewsPortfolios(books,'p9','p3')).toEqual([])
    expect(selectNewsPortfolios(books,'','p3')).toEqual([books[2]])
  })
  it('gives holding-specific headlines T3 across languages and ticker mentions', () => {
    for (const title of ['AAPL raises guidance','Apple announces earnings','苹果发布新产品'])
      expect(familyEventTier(event(title),profile)).toBe(3)
  })
  it('gives explicit watchlist or held-sector news T2', () => {
    expect(familyEventTier(event('MSFT raises guidance'),profile)).toBe(2)
    expect(familyEventTier(event('云计算行业需求增长'),profile)).toBe(2)
  })
  it('gives relevant market and macro news T1 without using private thesis tags', () => {
    expect(familyEventTier(event('Fed interest rate decision'),profile)).toBe(1)
    expect(familyEventTier(event('美国股市收盘上涨'),profile)).toBe(1)
    expect(familyEventTier(event('Unrelated company announces product',{symbols:['NVDA'],meta:{thesis:3}}),profile)).toBe(0)
    expect(familyEventTier(event('Pineapple demand rises'),profile)).toBe(0)
    expect(familyEventTier(event('Fed interest rate decision'),{holdings:[],watched:[]})).toBe(0)
  })
  it('re-ranks when the holdings and their sectors change', () => {
    const other={holdings:[{symbol:'JPM',names:['JPMorgan Chase'],category:'Financials'}],watched:[]}
    expect(familyEventTier(event('AAPL raises guidance'),other)).toBe(0)
    expect(familyEventTier(event('银行行业息差回升'),other)).toBe(2)
  })
})

it('matches listing punctuation exactly instead of treating it as a wildcard', () => {
  const p={holdings:[{symbol:'0700.HK',names:[]}],watched:[]}
  expect(familyEventTier(event('0700.HK results'),p)).toBe(3)
  expect(familyEventTier(event('0700XHK results'),p)).toBe(0)
})
