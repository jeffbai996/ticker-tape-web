import { describe, expect, it, vi } from 'vitest'
import { handleFamilyAI } from '../../worker/family_ai.js'
import worker from '../../worker/worker.js'
const cap='a'.repeat(32)
function request(path='/api/chat',token=cap,body={messages:[{role:'user',content:'Hello'}]}) {
 return new Request('https://app.example.test/family-ai'+path,{method:path.endsWith('/models')?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(path.endsWith('/models')?{}:{body:JSON.stringify(body)})})
}
function env() { return {FAMILY_SYNC_TOKEN:cap,FAMILY_AI_ORIGIN:'https://gateway.example.test',FAMILY_AI_GATEWAY_TOKEN:'upstream-secret',READER_QUOTA:{idFromName:vi.fn(()=> 'quota'),get:()=>({fetch:async()=>new Response(null,{status:204})})}} }
describe('family AI edge',()=>{
 it('routes family requests through authentication while generic chat stays closed',async()=>{
  expect((await worker.fetch(request('/api/chat','wrong'),env())).status).toBe(401)
  expect((await worker.fetch(new Request('https://app.example.test/chat'),env())).status).toBe(404)
 })
 it('does not contact the gateway without the family capability',async()=>{
  const fetcher=vi.fn();expect((await handleFamilyAI(request('/api/chat','wrong'),env(),fetcher)).status).toBe(401);expect(fetcher).not.toHaveBeenCalled()
 })
 it('fails closed when the gateway is not configured',async()=>{
  expect((await handleFamilyAI(request(),{FAMILY_SYNC_TOKEN:cap})).status).toBe(503)
 })
 it('allows only chat and model endpoints',async()=>{
  expect((await handleFamilyAI(request('/api/portfolio'),env())).status).toBe(404)
 })
 it('forwards only the server credential and pins the model',async()=>{
  const fetcher=vi.fn(async()=>Response.json({ok:true,text:'Hello'}));const response=await handleFamilyAI(request(),env(),fetcher)
  expect(response.status).toBe(200)
  const [url,options]=fetcher.mock.calls[0]
  expect(url).toBe('https://gateway.example.test/api/chat')
  expect(options.headers.Authorization).toBe('Bearer upstream-secret')
  expect(JSON.parse(options.body)).toMatchObject({model:'family-sonnet',effort:'medium'})
  expect(options.redirect).toBe('manual')
 })
 it('does not follow redirects with the gateway credential',async()=>{
  const response=await handleFamilyAI(request(),env(),async()=>new Response(null,{status:302,headers:{Location:'https://other.example.test'}}))
  expect(response.status).toBe(502)
 })
 it('bounds incoming bodies before contacting the gateway',async()=>{
  const fetcher=vi.fn();expect((await handleFamilyAI(request('/api/chat',cap,{system:'x'.repeat(70000)}),env(),fetcher)).status).toBe(413);expect(fetcher).not.toHaveBeenCalled()
 })
 it('enforces the independent family quota before inference',async()=>{
  const config=env();config.READER_QUOTA.get=()=>({fetch:async()=>new Response(null,{status:429})})
  const fetcher=vi.fn();expect((await handleFamilyAI(request(),config,fetcher)).status).toBe(429);expect(fetcher).not.toHaveBeenCalled()
 })
 it('sanitizes gateway network failures',async()=>{
  const response=await handleFamilyAI(request(),env(),async()=>{throw Error('credential private upstream')})
  expect(response.status).toBe(503);expect(await response.text()).not.toContain('credential')
 })
})

it('routes the approved Opus option with low effort and rejects arbitrary models',async()=>{
  const fetcher=vi.fn(async()=>Response.json({ok:true,text:'Done'}))
  const response=await handleFamilyAI(request('/api/chat',cap,{model:'family-opus',messages:[{role:'user',content:'Hello'}]}),env(),fetcher)
  expect(response.status).toBe(200)
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({model:'family-opus',effort:'low'})
  fetcher.mockClear()
  expect((await handleFamilyAI(request('/api/chat',cap,{model:'arbitrary'}),env(),fetcher)).status).toBe(400)
  expect(fetcher).not.toHaveBeenCalled()
})
