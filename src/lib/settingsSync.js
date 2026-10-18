import {PREFERENCE_KEYS,validateSettingsDocument} from './preferences.js'
export {validateSettingsDocument} from './preferences.js'
const META='settings_sync_v1'
const snapshot=storage=>Object.fromEntries(PREFERENCE_KEYS.map(k=>[k,storage.getItem(k)]))
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b)
export function mergeSettings(local,remote){
 const entries={}
 for(const key of PREFERENCE_KEYS){
  const l=local?.entries?.[key],r=remote?.entries?.[key]
  if(l||r)entries[key]=r&&(!l||r.stamp>=l.stamp)?r:l
 }
 return {entries}
}
/** Per-setting clocks preserve concurrent edits and explicit resets across devices. */
export class SettingsSync{
 constructor({storage=localStorage,fetch=globalThis.fetch.bind(globalThis),endpoint,headers=()=>({}),onApply=()=>{},now=Date.now}){
  Object.assign(this,{storage,fetch,endpoint,headers,onApply,now})
  let meta;try{meta=JSON.parse(storage.getItem(META))}catch{}
  this.doc=validateSettingsDocument(meta?.doc).ok?meta.doc:{entries:{}}
  this.seen=meta?.seen||snapshot(storage)
  if(!meta)for(const[key,value]of Object.entries(this.seen))if(value!==null){
   const candidate={entries:{[key]:{value,stamp:1}}}
   if(validateSettingsDocument(candidate).ok)this.doc.entries[key]=candidate.entries[key]
  }
  this.capture()
 }
 persist(){try{this.storage.setItem(META,JSON.stringify({doc:this.doc,seen:this.seen}))}catch{/* Sync can still proceed when browser storage is full. */}}
 capture(){
  const next=snapshot(this.storage)
  for(const key of PREFERENCE_KEYS)if(next[key]!==this.seen[key]){
   const entry={value:next[key],stamp:Math.max(this.now(),(this.doc.entries[key]?.stamp||0)+1)}
   if(validateSettingsDocument({entries:{[key]:entry}}).ok)this.doc.entries[key]=entry
  }
  this.seen=next;this.persist()
 }
 apply(doc){
  this.doc=doc
  let changed=false
  for(const[key,{value}]of Object.entries(doc.entries))if(this.storage.getItem(key)!==value){
   changed=true
   if(value===null)this.storage.removeItem(key);else this.storage.setItem(key,value)
  }
  if(changed)this.onApply()
  this.seen=snapshot(this.storage);this.persist()
 }
 async request(options){
  const response=await this.fetch(this.endpoint(),{...options,headers:{'Content-Type':'application/json',...this.headers()},signal:AbortSignal.timeout(10000)})
  const data=await response.json()
  if((!response.ok||!data.ok)&&response.status!==409)throw Error(data.error||'Settings sync failed')
  if(data.data!==null&&data.data!==undefined&&!validateSettingsDocument(data.data).ok)throw Error('Invalid synced settings')
  return {response,data}
 }
 sync(){
  if(this.running){this.again=true;return this.running}
  this.running=(async()=>{do{this.again=false;await this.reconcile()}while(this.again)})().finally(()=>{this.running=null})
  return this.running
 }
 async reconcile(){
  if(!this.endpoint())return
  this.capture()
  for(let attempt=0;attempt<3;attempt++){
   const {data:remote}=await this.request()
   const merged=mergeSettings(this.doc,remote.data)
   this.apply(merged)
   if(equal(mergeSettings(remote.data,null),merged)||!Object.keys(merged.entries).length)return
   const {response}=await this.request({method:'POST',body:JSON.stringify({rev:remote.rev,data:merged})})
   if(response.status!==409)return
  }
  throw Error('Settings changed on another device. Please try again.')
 }
}
