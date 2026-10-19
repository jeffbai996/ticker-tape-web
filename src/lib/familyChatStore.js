import {getTtwDeviceId} from './deviceIdentity.js'

const IMPORT='family_chat_import_v1',OUTBOX='family_chat_outbox_v1',IDS='family_chat_ids_v1'
const keys={memories:'chat_memories_v1',journal:'trade_journal_v1'}
const read=(storage,key,fallback)=>{try{return JSON.parse(storage.getItem(key))??fallback}catch{return fallback}}

/** Durable writes and one-time device imports over the family's existing capability. */
export class FamilyChatStore {
 constructor({storage=localStorage,fetch=globalThis.fetch.bind(globalThis),endpoint,headers,device=getTtwDeviceId(storage)}) {
  Object.assign(this,{storage,fetch,endpoint,headers,device})
  this.pending=read(storage,OUTBOX,[]);this.ids=read(storage,IDS,{})
  this.revisions=new Map();this.completed=new Map()
 }
 async raw(path,options={}) {
  const response=await this.fetch(this.endpoint()+path,{...options,headers:{'Content-Type':'application/json',...this.headers()},signal:AbortSignal.timeout(15000)})
  const data=await response.json()
  if(!response.ok||!data.ok)throw Object.assign(Error(data.error||'Chat sync failed'),{status:response.status})
  if(path.startsWith('/threads')&&data.item?.rev)this.revisions.set(data.item.id,data.item.rev)
  return data
 }
 prepare() {
  if(!this.preparing)this.preparing=this.importLocal().then(()=>this.recoverDraft()).catch(error=>{this.preparing=null;throw error})
  return this.preparing
 }
 async importLocal() {
  const meta=read(this.storage,IMPORT,{})
  if(meta.complete)return
  const send=async(kind,localId,body)=>{
   const key=`${kind}:${localId}`
   if(meta[key])return meta[key]
   const result=await this.raw(`/${kind}`,{method:'POST',body:JSON.stringify({...body,import_key:`${this.device}:${key}`})})
   meta[key]=result.item.id
   this.storage.setItem(IMPORT,JSON.stringify(meta))
   this.ids[key]=result.item.id;this.storage.setItem(IDS,JSON.stringify(this.ids))
   return result.item.id
  }
  for(const kind of ['memories','journal'])for(const item of read(this.storage,keys[kind],[])) {
   if(item?.text)await send(kind,item.id,{text:item.text,symbols:item.symbols})
  }
  const threads=read(this.storage,'chat_threads_v1',[])
  const active=this.storage.getItem('chat_local_thread_id')
  const cached=read(this.storage,'chat_history_v1',[])
  const rows=threads.map(t=>String(t.id)===active&&cached.length?{...t,messages:cached}:t)
  if(cached.length&&!rows.some(t=>String(t.id)===active))rows.push({id:'active',title:cached.find(m=>m.role==='user')?.content?.slice(0,60)||'new thread',messages:cached})
  for(const thread of rows) {
   if(!thread.messages?.length)continue
   const id=await send('threads',thread.id,{title:thread.title||'new thread',messages:thread.messages})
   if(String(thread.id)===active||thread.id==='active')this.storage.setItem('chat_thread_id',String(id))
  }
  meta.complete=true;this.storage.setItem(IMPORT,JSON.stringify(meta))
 }
 stage(id,messages) {
  if(messages===null){this.storage.removeItem('family_chat_draft_v1');return}
  this.storage.setItem('family_chat_draft_v1',JSON.stringify({id,rev:this.revisions.get(id),title:messages.find(m=>m.role==='user')?.content?.slice(0,60)||'new thread',messages}))
 }
 async recoverDraft() {
  const draft=read(this.storage,'family_chat_draft_v1',null)
  if(!draft||this.pending.some(job=>job.path.startsWith('/threads')&&JSON.stringify(job.body.messages)===JSON.stringify(draft.messages)))return
  const id=draft.id??(Number(this.storage.getItem('chat_thread_id'))||null)
  if(id!==null) {
   try {
    const {item}=await this.raw(`/threads/${id}`)
    if(JSON.stringify(item.messages)===JSON.stringify(draft.messages)){this.storage.removeItem('family_chat_draft_v1');return}
    this.enqueue(`/threads/${id}`,{method:'PUT',body:JSON.stringify({...draft,rev:draft.rev??item.rev})})
    return
   } catch(error){if(error.status!==404)throw error}
  }
  this.enqueue('/threads',{method:'POST',body:JSON.stringify(draft)})
 }
 reconcile(kind,localId,serverId) {
  if(localId==null)return
  this.ids[`${kind}:${localId}`]=serverId;this.storage.setItem(IDS,JSON.stringify(this.ids))
  if(keys[kind]) {
   const list=read(this.storage,keys[kind],[])
   const hit=list.find(item=>item.id===localId)
   if(hit){hit.id=serverId;this.storage.setItem(keys[kind],JSON.stringify(list))}
  }
 }
 enqueue(path,options,localId) {
  const key=globalThis.crypto.randomUUID().replaceAll('-','')
  this.pending.push({key,path,method:options.method,body:options.body?JSON.parse(options.body):{},localId,legacy:!read(this.storage,IMPORT,{}).complete})
  this.storage.setItem(OUTBOX,JSON.stringify(this.pending))
  return key
 }
 flush() {
  if(this.flushing)return this.flushing
  this.flushing=(async()=>{
   await this.prepare()
   while(this.pending.length) {
    const job=this.pending[0],parts=job.path.split('/'),kind=parts[1]
    if(parts[2]&&(Number(parts[2])<0||job.legacy))parts[2]=String(this.ids[`${kind}:${parts[2]}`]||parts[2])
    let data
    const imported=read(this.storage,IMPORT,{})[`${kind}:${job.localId}`]
    if(job.method==='POST'&&job.localId!=null&&imported) {
     data=await this.raw(`/${kind}/${imported}`)
    } else {
     const body={...job.body,...(job.method==='POST'?{import_key:`${this.device}:write:${job.key}`}:{mutation_key:job.key})}
     try {data=await this.raw(parts.join('/'),{method:job.method,...(job.method==='DELETE'?{}:{body:JSON.stringify(body)})})}
     catch(error) {
      if(error.status===404&&job.method==='DELETE')data={ok:true}
      else if([404,409].includes(error.status)&&kind==='threads'&&job.method==='PUT') {
       // Concurrent device edits preserve both conversations instead of overwriting one.
       data=await this.raw('/threads',{method:'POST',body:JSON.stringify({...job.body,import_key:`${this.device}:conflict:${job.key}`})})
       if(this.storage.getItem('chat_thread_id')===parts[2])this.storage.setItem('chat_thread_id',String(data.item.id))
      } else throw error
     }
    }
    if(data.item&&job.method==='POST') {
     this.reconcile(kind,job.localId,data.item.id)
     if(kind==='threads'&&!this.storage.getItem('chat_thread_id'))this.storage.setItem('chat_thread_id',String(data.item.id))
    }
    const draft=read(this.storage,'family_chat_draft_v1',null)
    if(kind==='threads'&&draft&&JSON.stringify(draft.messages)===JSON.stringify(job.body.messages))this.storage.removeItem('family_chat_draft_v1')
    this.completed.set(job.key,data)
    this.pending.shift();this.storage.setItem(OUTBOX,JSON.stringify(this.pending))
   }
  })().finally(()=>{this.flushing=null})
  return this.flushing
 }
 async request(path,options={}) {
  await this.flush()
  if(!options.method||options.method==='GET')return this.raw(path,options)
  if(options.method==='PUT'&&path.startsWith('/threads/')) {
   const id=Number(path.split('/').pop())
   if(!this.revisions.has(id))await this.raw(path)
   options={...options,body:JSON.stringify({...JSON.parse(options.body),rev:this.revisions.get(id)})}
  }
  const key=this.enqueue(path,options)
  await this.flush()
  const result=this.completed.get(key);this.completed.delete(key)
  return result
 }
 note(path,options,localId) {
  const key=this.enqueue(path,options,localId)
  return this.flush().then(()=>{const result=this.completed.get(key);this.completed.delete(key);return result})
 }
}
