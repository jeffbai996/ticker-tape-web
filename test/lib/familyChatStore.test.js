import {beforeEach,expect,it,vi} from 'vitest'
import {FamilyChatStore} from '../../src/lib/familyChatStore.js'
import {handleFamilyChat} from '../../worker/family_chat.js'
import {capDocEnv} from '../worker/capdocHarness.js'
const token='a'.repeat(32)
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}}
let env
beforeEach(()=>{env=capDocEnv(token)})
function device(id,store=storage(),fetcher) {
 return new FamilyChatStore({storage:store,device:id,endpoint:()=> 'https://worker.test/chatstore',headers:()=>({Authorization:`Bearer ${token}`}),fetch:fetcher||((url,options)=>handleFamilyChat(new Request(url,options),env))})
}
it('imports each device independently without losing existing local chats or creating retry duplicates',async()=>{
 const local=storage(),other=device('two')
 local.setItem('chat_memories_v1',JSON.stringify([{id:1,text:'Use concise answers'}]))
 local.setItem('chat_threads_v1',JSON.stringify([{id:1,title:'Old chat',messages:[{role:'user',content:'Hello'}]}]))
 local.setItem('chat_local_thread_id','1')
 const first=device('one',local)
 await first.request('/threads')
 expect((await other.request('/memories')).items[0].text).toBe('Use concise answers')
 const chats=(await other.request('/threads')).items
 expect(chats).toHaveLength(1)
 expect(local.getItem('chat_thread_id')).toBe(String(chats[0].id))
 expect(local.getItem('chat_threads_v1')).toContain('Old chat')
 await device('one',local).request('/threads')
 expect((await other.request('/threads')).items).toHaveLength(1)
})
it('retries queued notes after a network failure, including edits made before add acknowledgement',async()=>{
 const local=storage(),fetcher=vi.fn((url,options)=>handleFamilyChat(new Request(url,options),env)),a=device('one',local,fetcher)
 await a.prepare()
 fetcher.mockRejectedValueOnce(Error('offline'))
 await expect(a.note('/memories',{method:'POST',body:JSON.stringify({text:'Original'})},-1)).rejects.toThrow('offline')
 const b=device('one',local)
 await b.note('/memories/-1',{method:'PUT',body:JSON.stringify({text:'Updated'})})
 expect((await device('two').request('/memories')).items.map(m=>m.text)).toEqual(['Updated'])
})
it('keeps concurrent edits as separate chats rather than overwriting the other device',async()=>{
 const a=device('one'),b=device('two')
 const {item}=await a.request('/threads',{method:'POST',body:JSON.stringify({title:'Shared',messages:[{role:'user',content:'Original'}]})})
 await b.request(`/threads/${item.id}`)
 await a.request(`/threads/${item.id}`,{method:'PUT',body:JSON.stringify({title:'Shared',messages:[{role:'user',content:'First edit'}]})})
 await b.request(`/threads/${item.id}`,{method:'PUT',body:JSON.stringify({title:'Shared',messages:[{role:'user',content:'Second edit'}]})})
 const rows=(await a.request('/threads')).items
 expect(rows).toHaveLength(2)
 expect((await a.request(`/threads/${item.id}`)).item.messages[0].content).toBe('First edit')
})
it('does not confuse imported device ids with later shared note ids',async()=>{
 const a=device('one')
 await a.request('/memories',{method:'POST',body:JSON.stringify({text:'Shared first'})})
 const local=storage();local.setItem('chat_memories_v1',JSON.stringify([{id:1,text:'Imported second'}]))
 const b=device('two',local)
 await b.request('/memories')
 await b.note('/memories/1',{method:'PUT',body:JSON.stringify({text:'Edited first'})})
 const notes=(await a.request('/memories')).items
 expect(notes.find(m=>m.id===1).text).toBe('Edited first')
 expect(notes.find(m=>m.id===2).text).toBe('Imported second')
})
it('activates the family chatstore transport and reconciles provisional memory ids',async()=>{
 vi.stubEnv('VITE_FAMILY_BUILD','1');vi.stubEnv('VITE_SYNC_CAPABILITY',token);vi.resetModules()
 const fetcher=vi.fn((url,options)=>handleFamilyChat(new Request(url,options),env))
 vi.stubGlobal('fetch',fetcher);localStorage.clear()
 try {
  const store=await import('../../src/lib/chatstore.js')
  const memories=await import('../../src/lib/chatMemory.js')
  expect(store.chatstoreAvailable()).toBe(true)
  await store.syncNotes()
  const memory=memories.addMemory('Sync this preference')
  expect(memory.id).toBeLessThan(0)
  await store.syncNotes()
  expect(memories.loadMemories()).toEqual([expect.objectContaining({id:1,text:'Sync this preference'})])
  expect(fetcher.mock.calls.every(([url,options])=>url.includes('/chatstore/')&&options.headers.Authorization===`Bearer ${token}`)).toBe(true)
 } finally {vi.unstubAllGlobals();vi.unstubAllEnvs();vi.resetModules();localStorage.clear()}
})
it('recovers the last browser draft even when the page closed before the save debounce',async()=>{
 const local=storage()
 local.setItem('family_chat_import_v1',JSON.stringify({complete:true}))
 local.setItem('family_chat_draft_v1',JSON.stringify({id:null,title:'Unsaved chat',messages:[{role:'user',content:'Keep this draft'}]}))
 const a=device('one',local)
 const rows=(await a.request('/threads')).items
 expect(rows).toHaveLength(1)
 expect((await a.request(`/threads/${rows[0].id}`)).item.messages[0].content).toBe('Keep this draft')
 expect(local.getItem('family_chat_draft_v1')).toBeNull()
})
