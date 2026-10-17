import {expect,it,vi} from 'vitest'
import worker from '../../worker/worker.js'
import {handlePortfolioHistory} from '../../worker/portfolio_history.js'
const cap='a'.repeat(32)
const env={FAMILY_SYNC_TOKEN:cap,FAMILY_AI_ORIGIN:'https://gateway.example.test',FAMILY_AI_GATEWAY_TOKEN:'gateway-secret'}
const req=(query='book=p1',token=cap)=>new Request(`https://app.example.test/portfolio-history?${query}`,{headers:{Authorization:`Bearer ${token}`}})
it('authenticates history separately without spending inference quota',async()=>{
 const fetcher=vi.fn(async()=>Response.json({ok:true,marks:[]}))
 expect((await handlePortfolioHistory(req(),env,fetcher)).status).toBe(200)
 expect(fetcher.mock.calls[0][0]).toBe('https://gateway.example.test/api/history?book=p1&limit=400')
 expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('Bearer gateway-secret')
 expect((await worker.fetch(req('book=p1','wrong'),env)).status).toBe(401)
})
it('rejects arbitrary query paths and never follows upstream redirects',async()=>{
 const fetcher=vi.fn(async()=>new Response(null,{status:302,headers:{Location:'https://other.example.test'}}))
 expect((await handlePortfolioHistory(req('book=../../owner'),env,fetcher)).status).toBe(400)
 expect(fetcher).not.toHaveBeenCalled()
 expect((await handlePortfolioHistory(req(),env,fetcher)).status).toBe(502)
 expect(fetcher.mock.calls[0][1].redirect).toBe('manual')
})
