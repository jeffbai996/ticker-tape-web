import {beforeEach,expect,it} from 'vitest'
import {canResumeChat,markChatInteraction,CHAT_RESUME_MS} from '../../src/lib/chatnav.js'
beforeEach(()=>localStorage.clear())
it('resumes only inside the hour after the last interaction',()=>{
 const h=[{role:'user',content:'Hello',ts:1000}]
 markChatInteraction(5000)
 expect(canResumeChat(h,5000+CHAT_RESUME_MS-1)).toBe(true)
 expect(canResumeChat(h,5000+CHAT_RESUME_MS)).toBe(false)
 expect(canResumeChat([],6000)).toBe(false)
})
it('uses existing message timestamps until the first new interaction',()=>{
 expect(canResumeChat([{role:'user',ts:1000}],2000)).toBe(true)
 expect(canResumeChat([{role:'user',ts:1000}],1000+CHAT_RESUME_MS)).toBe(false)
})
