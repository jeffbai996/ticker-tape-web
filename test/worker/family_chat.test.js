// @vitest-environment node
import {expect,it} from 'vitest'
import {handleFamilyChat} from '../../worker/family_chat.js'
import {capDocEnv} from './capdocHarness.js'
const token='a'.repeat(32)
const call=(env,path,method='GET',body,auth=token)=>handleFamilyChat(new Request(`https://worker.test/chatstore${path}`,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json',Origin:'https://example.com'},...(body?{body:JSON.stringify(body)}:{})}),env)
it('requires the family bearer and handles preflight for note and chat mutations',async()=>{
 const env=capDocEnv(token)
 expect((await call(env,'/memories','GET',null,'b'.repeat(32))).status).toBe(401)
 expect((await call(env,'/broker')).status).toBe(404)
 const response=await call(env,'/threads/1','OPTIONS')
 expect(response.headers.get('Access-Control-Allow-Methods')).toContain('DELETE')
})
it('shares memories between independent clients and applies edits and deletes',async()=>{
 const env=capDocEnv(token)
 const created=await(await call(env,'/memories','POST',{text:'Use concise answers'})).json()
 const id=created.item.id
 expect((await(await call(env,'/memories')).json()).items).toContainEqual(expect.objectContaining({id,text:'Use concise answers'}))
 await call(env,`/memories/${id}`,'PUT',{text:'Use short paragraphs'})
 expect((await(await call(env,'/memories')).json()).items[0].text).toBe('Use short paragraphs')
 await call(env,`/memories/${id}`,'DELETE')
 expect((await(await call(env,'/memories')).json()).items).toEqual([])
})
it('imports device data idempotently and keeps independently created chats',async()=>{
 const env=capDocEnv(token),messages=[{role:'user',content:'Compare AAPL and MSFT'}]
 const body={title:'Comparison',messages,import_key:'device-one:thread:1'}
 const a=await(await call(env,'/threads','POST',body)).json()
 const retry=await(await call(env,'/threads','POST',body)).json()
 expect(retry.item.id).toBe(a.item.id)
 await call(env,'/threads','POST',{...body,import_key:'device-two:thread:1'})
 expect((await(await call(env,'/threads')).json()).items).toHaveLength(2)
 expect((await(await call(env,`/threads/${a.item.id}`)).json()).item.messages).toEqual(messages)
})
it('preserves large traced chats and rejects stale concurrent saves',async()=>{
 const env=capDocEnv(token),messages=[{role:'assistant',content:'x'.repeat(180000),trace:[{detail:'Saved trace'}]}]
 const first=await(await call(env,'/threads','POST',{title:'Long chat',messages})).json()
 const path=`/threads/${first.item.id}`
 expect((await(await call(env,path)).json()).item.messages).toEqual(messages)
 expect((await call(env,path,'PUT',{title:'Updated',messages:[],rev:first.item.rev})).status).toBe(200)
 expect((await call(env,path,'PUT',{messages,rev:first.item.rev})).status).toBe(409)
 await call(env,path,'DELETE')
 expect((await call(env,path)).status).toBe(404)
})
