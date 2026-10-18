import {expect,it} from 'vitest'
import {mergeSettings,SettingsSync,validateSettingsDocument} from '../../src/lib/settingsSync.js'
const pin='dashboard_landing_pin_v1',locale='locale_v1'
const doc=entries=>({entries})
const entry=(value,stamp)=>({value,stamp})
it('merges independent settings and propagates resets without stale-device resurrection',()=>{
 const merged=mergeSettings(doc({[pin]:entry('main',20),[locale]:entry('en',30)}),doc({[pin]:entry(null,40),[locale]:entry('zh',10)}))
 expect(merged.entries).toEqual({[pin]:entry(null,40),[locale]:entry('en',30)})
})
it('syncs an explicit opening list to a second device without copying its last viewed page',async()=>{
 const store=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}
 let remote=null,rev=0
 const fetch=async(url,options={})=>{
  if(options.method==='POST'){const body=JSON.parse(options.body);expect(body.rev).toBe(rev);remote=body.data;rev++}
  return {ok:true,status:200,json:async()=>({ok:true,data:remote,rev})}
 }
 const desktop=store();desktop.setItem(pin,'examples');desktop.setItem('dashboard_landing_v1','another')
 await new SettingsSync({storage:desktop,fetch,endpoint:()=>'/settings'}).sync()
 const phone=store();const sync=new SettingsSync({storage:phone,fetch,endpoint:()=>'/settings',now:()=>100})
 await sync.sync();expect(phone.getItem(pin)).toBe('examples');expect(phone.getItem('dashboard_landing_v1')).toBeNull()
 phone.removeItem(pin);sync.capture();await sync.sync()
 const reopened=new SettingsSync({storage:desktop,fetch,endpoint:()=>'/settings'})
 await reopened.sync();expect(desktop.getItem(pin)).toBeNull()
})
it('refuses credentials, current device routes and malformed preference values',()=>{
 for(const entries of [{token:entry('secret',1)},{dashboard_landing_v1:entry('main',1)},{[locale]:entry('invalid',1)},{[pin]:entry('main',-1)}])expect(validateSettingsDocument(doc(entries)).ok).toBe(false)
})
it('retries a revision conflict while preserving another devices independent edit',async()=>{
 const data=new Map([[pin,'examples']]),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}
 let remote=doc({[locale]:entry('en',20)}),rev=1,posts=0
 const fetch=async(url,options={})=>{
  let status=200
  if(options.method==='POST'){
   posts++
   if(posts===1){remote=doc({[locale]:entry('zh',30)});rev++;status=409}
   else{remote=JSON.parse(options.body).data;rev++}
  }
  return {ok:status===200,status,json:async()=>({ok:status===200,data:remote,rev})}
 }
 await new SettingsSync({storage,fetch,endpoint:()=>'/settings'}).sync()
 expect(posts).toBe(2);expect(remote.entries[locale].value).toBe('zh');expect(remote.entries[pin].value).toBe('examples')
})
