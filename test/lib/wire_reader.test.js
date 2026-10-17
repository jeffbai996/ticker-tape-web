import { afterEach, expect, it, vi } from 'vitest'
import { fetchWireArticle } from '../../src/lib/wire.js'

afterEach(()=>{vi.unstubAllEnvs();localStorage.clear()})

it('uses the existing Chinese reader for East Money stories without a reader capability',async()=>{
  vi.stubEnv('VITE_DATA_PROXY','https://proxy.example.test')
  const fetchImpl=vi.fn(async()=>Response.json({title:'Market story',paras:['Published Chinese article text.']}))
  const out=await fetchWireArticle('https://proxy.example.test/wire',
    {id:7,url:'https://finance.eastmoney.com/a/20260112123456789.html'},{fetchImpl,readerToken:''})
  expect(out.text).toBe('Published Chinese article text.')
  expect(fetchImpl.mock.calls[0][0]).toContain('https://proxy.example.test/cn/read?url=')
  expect(fetchImpl.mock.calls[0][0]).not.toContain('/api/read')
})

it('reads private cached articles by ID without forwarding the family credential',async()=>{
  const fetchImpl=vi.fn(async()=>Response.json({ok:true,text:'Facebook\n\nEmail\n\nArticle facts.\n\nView Original'}))
  const out=await fetchWireArticle('https://wire.example.test',{id:8,url:'https://reuters.com/story'},
    {fetchImpl,readerToken:'family-reader',refresh:true})
  expect(out.text).toBe('Article facts.')
  expect(fetchImpl.mock.calls[0][0]).toBe('https://wire.example.test/api/read?id=8&body=1&fast=1&refresh=1')
  expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
})
