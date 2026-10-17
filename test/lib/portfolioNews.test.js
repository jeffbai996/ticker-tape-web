import { afterEach, expect, it, vi } from 'vitest'
import { loadPortfolioWire, portfolioStories } from '../../src/lib/portfolioNews.js'

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals() })
const event = (id, headline, more = {}) => ({ id, type:'headline', headline,
  url:`https://www.reuters.com/news/${id}`, ts_event:1000+id, ...more })

it('uses one cached wire request without sending portfolio holdings upstream', async () => {
  const fetchImpl = vi.fn(async () => Response.json({ ok:true, events:[event(1,'AAPL reports results')] }))
  const base = 'https://wire-cache.example.test'
  await loadPortfolioWire(base,{fetchImpl})
  await loadPortfolioWire(base,{fetchImpl})
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(fetchImpl.mock.calls[0][0]).toBe(`${base}/api/events?newest=1&limit=500`)
})

it('matches Chinese company names in the public feed without private symbol tags', () => {
  const stories=portfolioStories([event(1,'苹果发布新产品',{language:'zh',publisher:'财联社'})],
    [{symbol:'AAPL',names:['苹果公司']}])
  expect(stories[0]).toMatchObject({symbol:'AAPL',publisher:'财联社',language:'zh'})
})

it('drops content mills and does not fill gaps with unrelated stories', () => {
  const rows=[event(1,'AAPL could soar',{url:'https://www.fool.com/a'}),event(2,'MSFT raises guidance')]
  expect(portfolioStories(rows,[{symbol:'AAPL',names:['Apple Inc.']}])).toEqual([])
})

it('deduplicates articles across holdings and retains all matching symbols', () => {
  const a=event(1,'Apple and Microsoft sign an agreement')
  const rows=portfolioStories([a,{...a,id:2}],[{symbol:'AAPL',names:['Apple Inc.']},{symbol:'MSFT',names:['Microsoft Corp.']}])
  expect(rows).toHaveLength(1)
  expect(rows[0].symbols).toEqual(['AAPL','MSFT'])
})

it('does not match short stock codes to ordinary words', () => {
  expect(portfolioStories([event(1,'AI investment increases')],[{symbol:'AI',names:['Example Software']}])).toEqual([])
})

it('bounds a failed feed request and reports an error without a provider fan-out', async () => {
  const fetchImpl=vi.fn(async()=>{throw Error('network down')})
  await expect(loadPortfolioWire('https://unavailable.example.test',{fetchImpl})).rejects.toThrow()
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
})
