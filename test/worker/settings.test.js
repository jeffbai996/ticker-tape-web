// @vitest-environment node
import {expect,it} from 'vitest'
import {handleSettings} from '../../worker/settings.js'
import {capDocEnv} from './capdocHarness.js'
const token='0'.repeat(32)
const request=(method='GET',body,auth=token)=>new Request('https://worker.test/settings',{method,headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},...(body?{body:JSON.stringify(body)}:{})})
it('keeps settings in their own authenticated revisioned document',async()=>{
 const env=capDocEnv(token),data={entries:{dashboard_landing_pin_v1:{value:'examples',stamp:10}}}
 expect((await handleSettings(request('GET',null,'1'.repeat(32)),env,'/settings')).status).toBe(401)
 expect((await handleSettings(request('POST',{rev:0,data}),env,'/settings')).status).toBe(200)
 expect(await(await handleSettings(request(),env,'/settings')).json()).toMatchObject({rev:1,data})
 expect((await handleSettings(request('POST',{rev:0,data}),env,'/settings')).status).toBe(409)
 expect((await handleSettings(request('POST',{rev:1,data:{entries:{token:{value:'secret',stamp:10}}}}),env,'/settings')).status).toBe(400)
 expect(env.SPEND.rows.has(`settings:${token}`)).toBe(true)
 expect(env.SPEND.rows.has(`watchlist:${token}`)).toBe(false)
})
