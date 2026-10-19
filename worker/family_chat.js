import {familyAuthState,familyCorsFor} from './security_log.js'

const ROUTE=/^\/chatstore\/(memories|journal|threads)(?:\/([1-9]\d{0,14}))?$/
const MAX_BYTES=4*1024*1024
const CHUNK=16000
const response=(data,status=200)=>Response.json(data,{status})

/** The same family capability and coordinator namespace as other synced data. */
export async function handleFamilyChat(request,env) {
 const url=new URL(request.url),match=url.pathname.match(ROUTE)
 const headers={...familyCorsFor(request),'Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS'}
 const out=(data,status=200)=>Response.json(data,{status,headers})
 if(!match||url.search)return out({ok:false,error:'not found'},404)
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
 if(familyAuthState(request,env)!=='ok')return out({ok:false,error:'authentication required'},401)
 if(!env.CAP_DOCS)return out({ok:false,error:'storage unavailable'},503)
 if(!['GET','POST','PUT','DELETE'].includes(request.method))return out({ok:false,error:'method not allowed'},405)
 let body
 if(['POST','PUT'].includes(request.method)) {
  try {
   if(Number(request.headers.get('Content-Length'))>MAX_BYTES)return out({ok:false,error:'chat too large'},413)
   const text=await request.text()
   if(new TextEncoder().encode(text).length>MAX_BYTES)return out({ok:false,error:'chat too large'},413)
   body=JSON.parse(text)
   if(!body||typeof body!=='object'||Array.isArray(body))throw Error()
  } catch{return out({ok:false,error:'invalid request'},400)}
 }
 try {
  const key=`chatstore:${env.FAMILY_SYNC_TOKEN}`
  const result=await env.CAP_DOCS.get(env.CAP_DOCS.idFromName(key)).fetch('https://capdoc.invalid'+url.pathname,{
   method:request.method,headers:{'Content-Type':'application/json','X-Capdoc-Key':key},
   ...(body?{body:JSON.stringify(body)}:{}),
  })
  return new Response(result.body,{status:result.status,headers:{...headers,'Content-Type':'application/json'}})
 } catch{return out({ok:false,error:'chat sync unavailable'},503)}
}

async function readThread(storage,item) {
 let text=''
 for(let i=0;i<item.chunks;i++) {
  const chunk=await storage.get(`body:${item.id}:${i}`)
  if(typeof chunk!=='string')throw Error('incomplete conversation')
  text+=chunk
 }
 return {...item,messages:JSON.parse(text)}
}

/** Called only inside the authenticated coordinator's serialized request queue. */
export async function handleChatData(request,storage) {
 const [,kind,rawId]=new URL(request.url).pathname.match(ROUTE)||[]
 if(!kind)return response({ok:false,error:'not found'},404)
 const id=rawId?Number(rawId):null,prefix=`${kind}:`
 if(request.method==='GET') {
  if(id!==null) {
   const item=await storage.get(prefix+id)
   return item?response({ok:true,item:kind==='threads'?await readThread(storage,item):item}):response({ok:false,error:'not found'},404)
  }
  const items=[...(await storage.list({prefix})).values()].sort((a,b)=>(b.updated_at||b.ts)-(a.updated_at||a.ts))
  return response({ok:true,items})
 }
 let body={}
 if(request.method!=='DELETE')body=await request.json()
 const validMessages=value=>Array.isArray(value)&&value.length<=400&&value.every(m=>m&&['user','assistant','tool','system'].includes(m.role)&&(m.content===undefined||typeof m.content==='string'))
 const validText=value=>typeof value==='string'&&value.trim().length>0&&value.length<=(kind==='journal'?20000:4000)
 if(request.method==='POST' && (id!==null || (kind==='threads'?!validMessages(body.messages)||typeof body.title!=='string'||body.title.length>200:!validText(body.text))))return response({ok:false,error:'invalid item'},400)
 if(request.method==='PUT' && (id===null || (kind==='threads'?(!validMessages(body.messages)||!Number.isSafeInteger(body.rev)):!validText(body.text))))return response({ok:false,error:'invalid update'},400)
 if(request.method==='DELETE'&&id===null)return response({ok:false,error:'item required'},400)
 if(body.import_key!==undefined&&(!/^[a-zA-Z0-9:_-]{1,128}$/.test(body.import_key)))return response({ok:false,error:'invalid import key'},400)
 return storage.transaction(async tx=>{
  let item=id===null?null:await tx.get(prefix+id)
  const importKey=body.import_key?`import:${kind}:${body.import_key}`:''
  if(request.method==='POST'&&importKey) {
   const previous=await tx.get(importKey)
   if(previous) {
    const existing=await tx.get(prefix+previous)
    return response({ok:true,item:existing?kind==='threads'?await readThread(tx,existing):existing:{id:previous,deleted:true}})
   }
  }
  if(body.mutation_key) {
   if(!/^[a-f0-9]{32}$/.test(body.mutation_key))return response({ok:false,error:'invalid mutation key'},400)
   if(await tx.get(`mutation:${body.mutation_key}`))return response({ok:true,...(item?{item:kind==='threads'?await readThread(tx,item):item}:{})})
  }
  if(request.method==='POST'&&importKey&&kind!=='threads') {
   const existing=[...(await tx.list({prefix})).values()].find(note=>note.text===body.text.trim())
   if(existing){await tx.put(importKey,existing.id);return response({ok:true,item:existing})}
  }
  if(id!==null&&!item)return response({ok:false,error:'not found'},404)
  if(request.method==='DELETE') {
   if(kind==='threads')for(let i=0;i<item.chunks;i++)await tx.delete(`body:${id}:${i}`)
   await tx.delete(prefix+id)
   return response({ok:true})
  }
  if(request.method==='PUT'&&kind==='threads'&&body.rev!==item.rev)return response({ok:false,error:'Conversation changed on another device. Reopen it before saving.'},409)
  if(request.method==='POST') {
   const next=(await tx.get(`next:${kind}`)||0)+1
   await tx.put(`next:${kind}`,next)
   item={id:next,ts:Date.now()/1000}
  }
  if(kind==='threads') {
   const text=JSON.stringify(body.messages),chunks=Math.ceil(text.length/CHUNK)
   for(let i=0;i<chunks;i++)await tx.put(`body:${item.id}:${i}`,text.slice(i*CHUNK,(i+1)*CHUNK))
   for(let i=chunks;i<(item.chunks||0);i++)await tx.delete(`body:${item.id}:${i}`)
   item={...item,title:typeof body.title==='string'?body.title.slice(0,200):item.title,n:body.messages.length,chunks,rev:(item.rev||0)+1,updated_at:Date.now()/1000}
  } else item={...item,text:body.text.trim(),...(kind==='journal'?{symbols:Array.isArray(body.symbols)?body.symbols.filter(s=>typeof s==='string').slice(0,60):item.symbols||[]}:{} )}
  await tx.put(prefix+item.id,item)
  if(body.mutation_key)await tx.put(`mutation:${body.mutation_key}`,true)
  if(importKey)await tx.put(importKey,item.id)
  return response({ok:true,item:kind==='threads'?{...item,messages:body.messages}:item})
 })
}
