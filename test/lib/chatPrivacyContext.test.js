import {expect,it,vi} from 'vitest'
vi.mock('../../src/lib/chatMemory.js',()=>({memoriesForPrompt:vi.fn(()=> 'Saved private fact'),MEMORY_PROMPT:'PERSIST_MEMORY_POLICY'}))
vi.mock('../../src/lib/watchlist.js',()=>({getWatchlist:()=>[]}))
vi.mock('../../src/lib/wire.js',()=>({wireServiceUrl:()=>''}))
vi.mock('../../src/lib/nav.js',()=>({IS_FAMILY_AI:false}))
import {memoriesForPrompt} from '../../src/lib/chatMemory.js'
import {buildChatContext} from '../../src/lib/chatContext.js'
it('omits saved memory and its persistence instructions from temporary context',async()=>{
 const temporary=await buildChatContext('Question',{temporary:true})
 expect(memoriesForPrompt).not.toHaveBeenCalled()
 expect(temporary).not.toContain('Saved private fact')
 expect(temporary).not.toContain('PERSIST_MEMORY_POLICY')
 const normal=await buildChatContext('Question')
 expect(normal).toContain('Saved private fact')
 expect(normal).toContain('PERSIST_MEMORY_POLICY')
})
