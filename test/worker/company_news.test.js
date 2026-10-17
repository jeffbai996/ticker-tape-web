// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { handleCompanyNews } from '../../worker/company_news.js'
const request = queries => new Request('https://worker.test/cn/news-batch', {method:'POST',body:JSON.stringify({queries})})
it('keeps company queries out of public snapshots and isolates failed companies', async()=>{
  const search=vi.fn(async q=>{if(q==='失败公司') throw Error('offline');return Response.json({result:{cmsArticleWebOld:[{title:q+'公告'}]}})})
  const response=await handleCompanyNews(request(['示例公司','失败公司']),search)
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  expect(await response.json()).toEqual({results:[{query:'示例公司',rows:[{title:'示例公司公告'}]},{query:'失败公司',error:'News service unavailable'}]})
  expect(search.mock.calls[0][1]).toBeInstanceOf(AbortSignal)
})
it('bounds batches before making any provider requests',async()=>{
  const search=vi.fn()
  for(const queries of [Array(13).fill('示例公司'),[''],['x'.repeat(41)]]) expect((await handleCompanyNews(request(queries),search)).status).toBe(400)
  expect(search).not.toHaveBeenCalled()
})
it('rejects malformed provider responses rather than caching empty coverage',async()=>{
  const response=await handleCompanyNews(request(['示例公司']),async()=>Response.json({error:'blocked'}))
  expect((await response.json()).results[0].error).toBeTruthy()
})
