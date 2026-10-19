import {h,render} from 'preact'
import {act} from 'preact/test-utils'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({boot:vi.fn(),preserve:vi.fn(),run:vi.fn(),save:vi.fn()}))
vi.mock('../../src/lib/nav.js',()=>({IS_FAMILY_AI:true,IS_FAMILY_BUILD:true,IS_PRIVATE_BUILD:false}))
vi.mock('../../src/hooks.js',()=>({useQuotes:()=>({}),useWatchlist:()=>[]}))
vi.mock('../../src/pages/dashboard.jsx',()=>({useEarningsDays:()=>({})}))
vi.mock('../../src/lib/wirechat.js',()=>({wireChatAvailable:()=>true,fetchWireChatModels:async()=>[{key:'family-sonnet',label:'Sonnet 5.5',efforts:['medium']}]}))
vi.mock('../../src/lib/chatContext.js',()=>({buildChatContext:async()=>'',hasLiveBook:()=>false,savedChatBook:()=>null}))
vi.mock('../../src/lib/chatstore.js',()=>({chatstoreAvailable:()=>false,syncNotes:async()=>{},CHATSTORE_ERROR_EVENT:'store-error',CHATSTORE_SYNC_EVENT:'store-sync'}))
vi.mock('../../src/lib/threads.js',()=>({
 loadActiveHistory:()=>[],hydrateActiveThread:()=>mocks.boot(),migrateLegacy:async()=>{},fetchThreadList:async()=>[],
 startNewThread:(history)=>mocks.preserve(history),saveActiveHistory:(history)=>mocks.save(history),flushActiveHistory:async()=>{},
 onThreadsChange:()=>()=>{},currentThreadId:()=>null,liveThreadList:()=>[],openThread:vi.fn(),removeThread:vi.fn(),deleteActiveThread:vi.fn(),
}))
vi.mock('../../src/lib/agent.js',()=>({trimHistory:x=>x,runAgentic:opts=>mocks.run(opts)}))
import {Chat} from '../../src/pages/chat.jsx'
import {stageChatQuestion,openContextualChat} from '../../src/lib/chatHandoff.js'
let root
const context={label:'Example income',data:{kind:'portfolio',portfolio_id:'book-2',portfolio:'Example income'}}
const old=[{role:'user',content:'Previous question'},{role:'assistant',content:'Previous answer'}]
const mount=async()=>act(async()=>render(h(Chat),root))
beforeEach(()=>{
 sessionStorage.clear();localStorage.clear();vi.clearAllMocks()
 Object.defineProperty(Element.prototype,'scrollTo',{configurable:true,value:vi.fn()})
 mocks.boot.mockResolvedValue(old);mocks.preserve.mockResolvedValue(undefined)
 mocks.run.mockImplementation(async opts=>{opts.onRound([{role:'assistant',content:'Generated explanation'}])})
 root=document.createElement('div');document.body.append(root)
})
afterEach(()=>{act(()=>render(null,root));root.remove();delete Element.prototype.scrollTo})
it('waits for hydration, preserves the old conversation and runs the clicked book once on cold and warm entry',async()=>{
 let hydrate
 mocks.boot.mockReturnValue(new Promise(resolve=>{hydrate=resolve}))
 stageChatQuestion('Explain Example income',context,{submit:true})
 await mount()
 expect(mocks.run).not.toHaveBeenCalled()
 await act(async()=>hydrate(old))
 await vi.waitFor(()=>expect(mocks.run).toHaveBeenCalledTimes(1))
 expect(mocks.preserve).toHaveBeenCalledWith(old)
 const first=mocks.run.mock.calls[0][0]
 expect(first.messages).toEqual([expect.objectContaining({role:'user',content:'Explain Example income',context})])
 expect(first.initialTools).toContainEqual({name:'get_portfolio',args:{portfolio:'book-2',section:'holdings'}})
 await vi.waitFor(()=>expect(mocks.save).toHaveBeenCalled())
 expect(root.textContent).toContain('Generated explanation')
 await act(()=>openContextualChat('Check Example growth',{label:'Example growth',data:{portfolio_id:'book-3'}},{submit:true}))
 await vi.waitFor(()=>expect(mocks.run).toHaveBeenCalledTimes(2))
 expect(mocks.run.mock.calls[1][0].messages[0].content).toBe('Check Example growth')
 expect(mocks.preserve.mock.calls[1][0].some(m=>m.content==='Generated explanation')).toBe(true)
 // A mounted chat rerender and a later remount cannot replay consumed intent.
 await mount()
 expect(mocks.run).toHaveBeenCalledTimes(2)
 await act(()=>render(null,root));await mount()
 expect(mocks.run).toHaveBeenCalledTimes(2)
})
it('cancels automatic submission if the user edits while hydration is pending',async()=>{
 let hydrate
 mocks.boot.mockReturnValue(new Promise(resolve=>{hydrate=resolve}))
 stageChatQuestion('Explain Example income',context,{submit:true})
 await mount()
 const composer=root.querySelector('textarea')
 await act(()=>{composer.value='A different question';composer.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(async()=>hydrate(old))
 expect(mocks.run).not.toHaveBeenCalled()
 expect(composer.value).toBe('A different question')
})
it('does not start generation after leaving during the conversation save',async()=>{
 let saved
 mocks.preserve.mockReturnValue(new Promise(resolve=>{saved=resolve}))
 stageChatQuestion('Explain Example income',context,{submit:true})
 await mount()
 await vi.waitFor(()=>expect(mocks.preserve).toHaveBeenCalledTimes(1))
 await act(()=>render(null,root))
 await act(async()=>saved())
 expect(mocks.run).not.toHaveBeenCalled()
})

it('keeps the question available for retry if saving the previous conversation fails',async()=>{
 mocks.preserve.mockRejectedValue(new Error('Save unavailable'))
 stageChatQuestion('Explain Example income',context,{submit:true})
 await mount()
 await vi.waitFor(()=>expect(root.textContent).toContain('Save unavailable'))
 expect(mocks.run).not.toHaveBeenCalled()
 expect(root.querySelector('textarea').value).toBe('Explain Example income')
})
it('keeps incognito turns and one-click follow-ups out of saved history and memory',async()=>{
 await mount()
 await vi.waitFor(()=>expect(root.querySelector('[data-incognito-toggle]')?.disabled).toBe(false))
 await act(()=>root.querySelector('[data-incognito-toggle]').click())
 await vi.waitFor(()=>expect(root.querySelector('[data-incognito-toggle]').getAttribute('aria-pressed')).toBe('true'))
 expect(mocks.preserve).toHaveBeenCalledWith(old)
 mocks.save.mockClear()
 mocks.run.mockImplementation(async opts=>opts.onRound([{role:'assistant',content:'Temporary answer [MEMORY: Private fact]'}]))
 let composer=root.querySelector('textarea')
 await act(()=>{composer.value='Private question';composer.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(()=>{composer.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
 await vi.waitFor(()=>expect(mocks.run).toHaveBeenCalledTimes(1))
 expect(mocks.run.mock.calls[0][0].temporary).toBe(true)
 await vi.waitFor(()=>expect(root.textContent).toContain('Temporary answer'))
 expect(mocks.save).not.toHaveBeenCalled()
 expect(localStorage.getItem('chat_memories_v1')).toBeNull()
 expect(root.textContent).not.toContain('[MEMORY:')
 await act(()=>openContextualChat('Private portfolio review',context,{submit:true}))
 await vi.waitFor(()=>expect(mocks.run).toHaveBeenCalledTimes(2))
 expect(mocks.preserve).toHaveBeenCalledTimes(1)
 expect(mocks.save).not.toHaveBeenCalled()
 await vi.waitFor(()=>expect(root.querySelector('[data-incognito-toggle]').disabled).toBe(false))
 await act(()=>root.querySelector('[data-incognito-toggle]').click())
 expect(root.textContent).not.toContain('Private question')
 expect(root.querySelector('[data-incognito-toggle]').getAttribute('aria-pressed')).toBe('false')
 mocks.run.mockImplementation(async opts=>opts.onRound([{role:'assistant',content:'Normal answer'}]))
 composer=root.querySelector('textarea')
 await act(()=>{composer.value='Normal question';composer.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(()=>{composer.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
 await vi.waitFor(()=>expect(mocks.save).toHaveBeenCalled())
 expect(mocks.run.mock.calls[2][0].temporary).toBe(false)
})
