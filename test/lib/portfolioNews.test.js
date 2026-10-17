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
  const rows=[event(1,'AAPL could soar',{url:'https://www.fool.com/a'}),event(2,'MSFT raises guidance'),
    event(3,'Reuters says AAPL reported results',{url:'https://www.fool.com/b'})]
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

it('loads company-specific HK and A-share stories and rejects unrelated search hits', async()=>{
  const { loadCompanyNews }=await import('../../src/lib/portfolioNews.js')
  const fetchImpl=vi.fn(async()=>Response.json({results:[
    {query:'示例科技',rows:[{title:'示例科技发布业绩',url:'https://finance.eastmoney.com/a/202610170001.html',mediaName:'财联社',date:'2026-10-17 12:00:00'},{title:'其他公司消息',url:'https://finance.eastmoney.com/a/202610170002.html',mediaName:'财联社',date:'2026-10-17 12:00:00'}]},
    {query:'示例银行',rows:[{title:'示例银行分红公告',url:'https://finance.eastmoney.com/a/202610170003.html',mediaName:'证券时报',date:'2026-10-17 12:00:00'}]},
  ]}))
  const holdings=[{symbol:'0001.HK',names:['示例科技-W']},{symbol:'000001.SZ',names:['示例银行']}]
  const out=await loadCompanyNews(holdings,{fetchImpl})
  expect(out.failed).toEqual([])
  expect(portfolioStories(out.events,holdings).map(s=>s.symbol)).toEqual(['0001.HK','000001.SZ'])
  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(fetchImpl.mock.calls[0][0]).toMatch(/\/cn\/news-batch$/)
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({queries:['示例科技','示例银行']})
  await loadCompanyNews(holdings,{fetchImpl})
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})
it('reports unavailable companies separately from successful empty searches',async()=>{
  const { loadCompanyNews }=await import('../../src/lib/portfolioNews.js')
  const out=await loadCompanyNews([{symbol:'0002.HK',names:['第二示例']},{symbol:'000003.SZ',names:['第三示例']}],{fetchImpl:async()=>Response.json({results:[{query:'第二示例',rows:[]},{query:'第三示例',error:'unavailable'},{query:'0002',rows:[]},{query:'000003',rows:[]}]})})
  expect(out.failed).toEqual(['000003.SZ'])
  expect(out.events).toEqual([])
})

it('recovers a renamed A-share by its stock code without accepting unrelated results',async()=>{
  const { loadCompanyNews }=await import('../../src/lib/portfolioNews.js')
  const fetchImpl=vi.fn(async(_url,opts)=>Response.json({results:JSON.parse(opts.body).queries.map(query=>({query,rows:query==='000004' ? [
    {title:'证券时报：000004 发布业绩公告',url:'https://finance.eastmoney.com/a/202610170004.html',mediaName:'证券时报',date:'2026-10-17 12:00:00'},
  ] : []}))}))
  const holdings=[{symbol:'000004.SZ',names:['旧公司名称']}]
  const out=await loadCompanyNews(holdings,{fetchImpl})
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  expect(portfolioStories(out.events,holdings)).toHaveLength(1)
  expect(out.failed).toEqual([])
})
