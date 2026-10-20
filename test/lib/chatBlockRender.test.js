import {h,render} from 'preact'
import {act} from 'preact/test-utils'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({boot:vi.fn(),preserve:vi.fn(),run:vi.fn(),save:vi.fn()}))
vi.mock('../../src/lib/nav.js',()=>({IS_FAMILY_AI:true,IS_FAMILY_BUILD:true,IS_PRIVATE_BUILD:false}))
vi.mock('../../src/hooks.js',()=>({useQuotes:()=>({}),useWatchlist:()=>[]}))
vi.mock('../../src/pages/dashboard.jsx',()=>({useEarningsDays:()=>({})}))
vi.mock('../../src/lib/wirechat.js',()=>({wireChatAvailable:()=>true,fetchWireChatModels:async()=>[{key:'family-sonnet',label:'Sonnet 5.5',efforts:['medium']}]}))
vi.mock('../../src/lib/chatContext.js',()=>({buildChatContext:async()=>'',hasLiveBook:()=>false,savedChatBooks:()=>[],fetchBooksJson:async()=>[]}))
vi.mock('../../src/lib/chatstore.js',()=>({chatstoreAvailable:()=>false,syncNotes:async()=>{},CHATSTORE_ERROR_EVENT:'store-error',CHATSTORE_SYNC_EVENT:'store-sync'}))
vi.mock('../../src/lib/threads.js',()=>({
 loadActiveHistory:()=>[],hydrateActiveThread:()=>mocks.boot(),migrateLegacy:async()=>{},fetchThreadList:async()=>[],
 startNewThread:(history)=>mocks.preserve(history),saveActiveHistory:(history)=>mocks.save(history),flushActiveHistory:async()=>{},
 onThreadsChange:()=>()=>{},currentThreadId:()=>null,liveThreadList:()=>[],openThread:vi.fn(),removeThread:vi.fn(),deleteActiveThread:vi.fn(),
}))
vi.mock('../../src/lib/agent.js',()=>({trimHistory:x=>x,runAgentic:opts=>mocks.run(opts)}))
import {Chat} from '../../src/pages/chat.jsx'
import {ChatBlock,ChatBlocks,formatBlockValue} from '../../src/components/ChatBlock.jsx'
import {stageChatQuestion} from '../../src/lib/chatHandoff.js'
import {markChatInteraction} from '../../src/lib/chatnav.js'

const line={v:1,type:'line',id:'cmp',title:'AAPL vs MSFT · indexed return',subtitle:'1Y · 2026-01-02 = 100',unit:{kind:'index',baseline:100,digits:1},
 source:{tool:'chart_compare',provider:'Yahoo Finance',asOf:1_700_000_000_000},notes:['Dividends excluded.'],
 dates:['2026-01-02','2026-01-05','2026-01-06'],series:[{key:'AAPL',label:'AAPL',values:[100,104.2,99.5]},{key:'MSFT',label:'MSFT',values:[100,null,102]}]}
const bars={v:1,type:'bars',id:'contrib',title:'Example income · today’s contributors',unit:{kind:'ccy',currency:'CAD',digits:0},signed:true,
 items:[{key:'AAPL',label:'Apple',value:120.46,pct:2.05},{key:'MSFT',label:'MSFT',value:-45,pct:-1.5},{key:'XYZ',label:'XYZ',value:null,note:'no price'}]}
const table={v:1,type:'table',id:'tbl',title:'Returns',columns:[{key:'s',label:'Symbol'},{key:'r',label:'Return %',align:'right'}],rows:[['AAPL',4.2],['MSFT',null]]}
let root
const mount=async(node)=>act(async()=>render(node,root))
beforeEach(()=>{
 sessionStorage.clear();localStorage.clear();vi.clearAllMocks()
 Object.defineProperty(Element.prototype,'scrollTo',{configurable:true,value:vi.fn()})
 mocks.boot.mockResolvedValue([]);mocks.preserve.mockResolvedValue(undefined)
 root=document.createElement('div');document.body.append(root)
})
afterEach(()=>{act(()=>render(null,root));root.remove();delete Element.prototype.scrollTo})

describe('ChatBlock',()=>{
 it('draws a line chart with a legend, and the same data as a table on request',async()=>{
  await mount(h(ChatBlock,{block:line}))
  expect(root.querySelector('svg[role="img"]').getAttribute('aria-label')).toBe('AAPL vs MSFT · indexed return')
  expect(root.querySelectorAll('path').length).toBe(2)
  expect(root.textContent).toContain('Yahoo Finance')
  expect(root.textContent).toContain('Dividends excluded.')
  const [,tableButton]=root.querySelectorAll('[role="group"] button')
  await act(()=>tableButton.click())
  expect(root.querySelector('svg[role="img"]')).toBeNull()
  const cells=[...root.querySelectorAll('tbody td')].map(td=>td.textContent)
  expect(cells).toEqual(['2026-01-02','100.0','100.0','2026-01-05','104.2','—','2026-01-06','99.5','102.0'])
 })
 it('hides a series from the legend without ever hiding the last one',async()=>{
  await mount(h(ChatBlock,{block:line}))
  const [aapl,msft]=root.querySelectorAll('.chat-block-line button')
  await act(()=>aapl.click())
  expect(aapl.getAttribute('aria-pressed')).toBe('false')
  expect(root.querySelectorAll('path').length).toBe(1)
  await act(()=>msft.click())
  expect(msft.getAttribute('aria-pressed')).toBe('true')
  expect(root.querySelectorAll('path').length).toBe(1)
 })
 it('renders signed contributors with direction colours and names the unpriced holding',async()=>{
  await mount(h(ChatBlock,{block:bars}))
  const rows=[...root.querySelectorAll('[role="listitem"]')]
  expect(rows.map(r=>r.textContent)).toEqual(['Apple+C$120 +2.05%','MSFT−C$45 −1.50%','XYZ— · no price'])
  expect(rows[0].querySelector('.bg-\\[var\\(--color-up\\)\\]')).not.toBeNull()
  expect(rows[1].querySelector('.bg-\\[var\\(--color-down\\)\\]')).not.toBeNull()
  expect(rows[2].querySelector('[style*="width"]')).toBeNull()
 })
 it('renders a table block without a chart toggle',async()=>{
  await mount(h(ChatBlock,{block:table}))
  expect(root.querySelector('[role="group"]')).toBeNull()
  expect([...root.querySelectorAll('tbody td')].map(td=>td.textContent)).toEqual(['AAPL','4.20','MSFT','—'])
 })
 it('formats values by unit',()=>{
  expect(formatBlockValue(1234.5,{kind:'ccy',currency:'USD',digits:0})).toBe('$1,235')
  expect(formatBlockValue(-3.456,{kind:'pct'})).toBe('−3.5%')
  expect(formatBlockValue(3.456,{kind:'pct'},{signed:true})).toBe('+3.5%')
  expect(formatBlockValue(NaN,{kind:'index'})).toBe('—')
 })
 it('draws nothing for an empty list',async()=>{
  await mount(h(ChatBlocks,{blocks:[]}))
  expect(root.innerHTML).toBe('')
 })
})

describe('transcript integration',()=>{
 const submit=async(text)=>{
  const composer=root.querySelector('textarea')
  await act(()=>{composer.value=text;composer.dispatchEvent(new Event('input',{bubbles:true}))})
  await act(()=>{composer.closest('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))})
 }
 const toolTurn=(block)=>[
  {role:'assistant',content:'',toolCalls:[{id:'w0',name:'chart_compare',args:{symbols:['AAPL','MSFT']}}]},
  {role:'tool',id:'w0',name:'chart_compare',content:'{"chart":"shown"}',...(block?{block}:{})},
 ]
 it('shows the chart while the answer streams, then with the saved answer, exactly once',async()=>{
  let finish
  mocks.run.mockImplementation(async opts=>{
   opts.onTrace({type:'model_start',round:0});opts.onTrace({type:'model_done',round:0,outcome:'tool'})
   opts.onRound(toolTurn(line))
   await new Promise(resolve=>{finish=resolve})
   opts.onDelta('AAPL led');opts.onRound([...toolTurn(line),{role:'assistant',content:'AAPL led the pair.'}])
  })
  await mount(h(Chat))
  await submit('Compare AAPL and MSFT')
  await vi.waitFor(()=>expect(root.querySelectorAll('[data-chat-block]').length).toBe(1))
  expect(root.textContent).not.toContain('"chart":"shown"')
  await act(async()=>finish())
  await vi.waitFor(()=>expect(root.textContent).toContain('AAPL led the pair.'))
  expect(root.querySelectorAll('[data-chat-block]').length).toBe(1)
  // the block precedes the answer and is persisted on its tool record, not as a new message
  const blocks=root.querySelector('[data-chat-blocks]'),answer=[...root.querySelectorAll('.chat-assistant-bubble')].at(-1)
  expect(blocks.compareDocumentPosition(answer)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  await vi.waitFor(()=>expect(mocks.save).toHaveBeenCalled())
  const saved=mocks.save.mock.calls.at(-1)[0]
  expect(saved.filter(m=>m.role==='tool')[0].block).toEqual(line)
  expect(saved.filter(m=>m.role==='assistant'&&m.content).length).toBe(1)
  await mount(h(Chat))
  expect(root.querySelectorAll('[data-chat-block]').length).toBe(1)
 })
 it('keeps the prose when a block is malformed and renders legacy threads untouched',async()=>{
  mocks.boot.mockResolvedValue([{role:'user',content:'Old question'},{role:'assistant',content:'Old answer'},
   {role:'user',content:'Compare'},...toolTurn({v:1,type:'line',id:'bad',title:'x',dates:['nope'],series:[]}),{role:'assistant',content:'Prose survives.'},
   {role:'user',content:'Again'},...toolTurn({v:1,type:'line',id:'ok',title:'Fine',dates:['2026-01-02','2026-01-05'],series:[{key:'A',values:[1,2]}]}),{role:'assistant',content:'Second answer.'}])
  markChatInteraction()
  await mount(h(Chat))
  await vi.waitFor(()=>expect(root.textContent).toContain('Second answer.'))
  expect(root.textContent).toContain('Old answer')
  expect(root.textContent).toContain('Prose survives.')
  expect([...root.querySelectorAll('[data-chat-block]')].map(el=>el.dataset.blockId)).toEqual(['ok'])
 })
 it('draws a chart for a stopped turn that produced no prose',async()=>{
  mocks.boot.mockResolvedValue([{role:'user',content:'Compare'},...toolTurn(line)])
  markChatInteraction()
  await mount(h(Chat))
  await vi.waitFor(()=>expect(root.querySelectorAll('[data-chat-block]').length).toBe(1))
 })
 it('keeps an incognito chart in memory only, and the next normal chart still saves',async()=>{
  mocks.boot.mockResolvedValue([{role:'user',content:'Previous'},{role:'assistant',content:'Kept'}])
  mocks.run.mockImplementation(async opts=>opts.onRound([...toolTurn(bars),{role:'assistant',content:'Temporary answer'}]))
  await mount(h(Chat))
  await vi.waitFor(()=>expect(root.querySelector('[data-incognito-toggle]')?.disabled).toBe(false))
  await act(()=>root.querySelector('[data-incognito-toggle]').click())
  await vi.waitFor(()=>expect(root.querySelector('[data-incognito-toggle]').getAttribute('aria-pressed')).toBe('true'))
  mocks.save.mockClear()
  await submit('Private book question')
  await vi.waitFor(()=>expect(root.querySelectorAll('[data-chat-block]').length).toBe(1))
  expect(mocks.run.mock.calls[0][0].temporary).toBe(true)
  expect(mocks.save).not.toHaveBeenCalled()
  expect(JSON.stringify(localStorage)).not.toContain('contrib')
  expect(JSON.stringify(sessionStorage)).not.toContain('contrib')
  await vi.waitFor(()=>expect(root.querySelector('[data-incognito-toggle]').disabled).toBe(false))
  await act(()=>root.querySelector('[data-incognito-toggle]').click())
  expect(root.querySelectorAll('[data-chat-block]').length).toBe(0)
  expect(mocks.preserve.mock.calls.flat(2).some(m=>m?.block)).toBe(false)
  mocks.run.mockImplementation(async opts=>opts.onRound([...toolTurn(line),{role:'assistant',content:'Normal answer'}]))
  await submit('Normal comparison')
  await vi.waitFor(()=>expect(mocks.save).toHaveBeenCalled())
  expect(mocks.save.mock.calls.at(-1)[0].some(m=>m.block?.id==='cmp')).toBe(true)
 })
 it('runs the one-click book view before the model and shows its chart with the clicked book name',async()=>{
  mocks.run.mockImplementation(async opts=>{
   expect(opts.initialTools).toContainEqual({name:'chart_portfolio',args:{portfolio:'book-2',view:'contributors'}})
   opts.onRound([...toolTurn(bars),{role:'assistant',content:'Apple carried the book.'}])
  })
  stageChatQuestion('解读「Example income」组合最新的涨跌及主要原因。',{label:'Example income',data:{kind:'portfolio',portfolio_id:'book-2',portfolio:'Example income',visual:'contributors'}},{submit:true})
  await mount(h(Chat))
  await vi.waitFor(()=>expect(root.textContent).toContain('Apple carried the book.'))
  expect(root.querySelector('[data-chat-block]').textContent).toContain('Example income · today’s contributors')
 })
})
