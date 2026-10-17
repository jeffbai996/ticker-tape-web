import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, it, vi } from 'vitest'

const pool=vi.hoisted(()=>({load:vi.fn(),company:vi.fn(async()=>({events:[],failed:[]}))}))
vi.mock('../../src/lib/portfolioNews.js',async original=>({
  ...await original(), loadPortfolioWire:pool.load, loadCompanyNews:pool.company, peekPortfolioWire:()=>undefined,
}))
vi.mock('../../src/lib/wire.js',async original=>({...await original(),wireUrl:()=> 'https://wire.example.test'}))
vi.mock('../../src/lib/zhNames.js',()=>({loadZhTable:async()=>null,onZhTable:()=>()=>{},zhName:()=>null}))
vi.mock('../../src/lib/history.js',()=>({fetchNews:()=>{throw Error('per-holding provider request')}}))
const { BookNews }=await import('../../src/pages/portfolioNews.jsx')
let root
afterEach(()=>{if(root){render(null,root);root.remove();root=null} pool.load.mockReset();localStorage.clear()})

async function mount() {
  root=document.createElement('div');document.body.append(root)
  await act(async()=>render(h(BookNews,{portfolio:{holdings:[{symbol:'AAPL'},{symbol:'MSFT'}]},quotes:{AAPL:{name:'Apple Inc.'},MSFT:{name:'Microsoft Corp.'}}}),root))
  await act(async()=>{})
}

it('renders portfolio headlines after one batch request without a per-symbol loading queue',async()=>{
  pool.load.mockResolvedValue([{id:1,type:'headline',headline:'Apple reports results',url:'https://reuters.com/a',ts_event:1000}])
  await mount()
  expect(pool.load).toHaveBeenCalledTimes(1)
  expect(root.textContent).toContain('Apple reports results')
  expect(root.textContent).not.toMatch(/loading\s+\d+\//i)
})

it('settles a failed request and offers retry instead of an indefinite loading counter',async()=>{
  pool.load.mockRejectedValue(Error('unavailable'))
  await mount()
  expect(root.querySelector('[role="alert"]')).not.toBeNull()
  expect(root.querySelector('[data-news-refresh]')).not.toBeNull()
  expect(root.textContent).not.toMatch(/loading\s+\d+\//i)
})

it('paints wire results while company coverage is pending and appends company results',async()=>{
  let finish
  pool.load.mockResolvedValue([{id:1,type:'headline',headline:'Apple reports results',url:'https://reuters.com/a',ts_event:1000}])
  pool.company.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
  await mount()
  expect(root.textContent).toContain('Apple reports results')
  await act(async()=>finish({events:[{type:'headline',headline:'Microsoft raises guidance',url:'https://reuters.com/b',ts_event:1001}],failed:[]}))
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))})
  expect(root.textContent).toContain('Microsoft raises guidance')
  expect(root.querySelector('[data-news-refresh]').disabled).toBe(false)
})
