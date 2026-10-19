import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); localStorage.clear() })

async function family(enabled = true, build = true) {
  vi.stubEnv('VITE_PRIVATE', '')
  vi.stubEnv('VITE_FAMILY_BUILD', build ? '1' : '')
  vi.stubEnv('VITE_FAMILY_AI', enabled ? '1' : '')
  vi.stubEnv('VITE_SYNC_CAPABILITY', 'a'.repeat(32))
  vi.stubEnv('VITE_DATA_PROXY', 'https://proxy.example.test')
  return import('../../src/lib/wirechat.js')
}

it('uses only the family transport and pins Sonnet Medium', async () => {
  const chat = await family()
  const fetcher = vi.fn(async () => Response.json({ ok: true, text: 'Summary' }))
  vi.stubGlobal('fetch', fetcher)
  expect(chat.wireChatAvailable()).toBe(true)
  await chat.wireComplete({ model: 'other', effort: 'high', messages: [{ role: 'user', content: 'Hello' }] })
  const [url, options] = fetcher.mock.calls[0]
  expect(url).toBe('https://proxy.example.test/family-ai/api/chat')
  expect(options.headers.Authorization).toBe(`Bearer ${'a'.repeat(32)}`)
  expect(JSON.parse(options.body)).toMatchObject({ model: 'family-sonnet', effort: 'medium' })
  expect((await import('../../src/lib/wire.js')).wireServiceUrl()).toBe('')
})

it('keeps family inference off until explicitly enabled', async () => {
  const chat = await family(false)
  expect(chat.wireChatAvailable()).toBe(false)
  const { NAV } = await import('../../src/lib/nav.js')
  expect(NAV.find(s => s.id === 'chat').badge).toBe('DEMO')
  expect(NAV.some(s => s.id === 'brief')).toBe(true)
})

it('keeps the family demo badge in navigation while chat is active', async () => {
  await family()
  const { NAV } = await import('../../src/lib/nav.js')
  expect(NAV.find(s => s.id === 'chat').badge).toBe('DEMO')
})

it('never enables inference in the public build', async () => {
  await family(true, false)
  const chat = await import('../../src/lib/wirechat.js')
  expect(chat.wireChatAvailable()).toBe(false)
})

it('keeps an unconfigured family build on the preview', async () => {
  vi.stubEnv('VITE_FAMILY_BUILD', '1')
  vi.stubEnv('VITE_FAMILY_AI', '1')
  vi.stubEnv('VITE_SYNC_CAPABILITY', '')
  const { IS_FAMILY_AI } = await import('../../src/lib/nav.js')
  expect(IS_FAMILY_AI).toBe(false)
})

it('generates a family report through the subscription transport', async () => {
  await family()
  const fetcher = vi.fn(async url => String(url).endsWith('/models')
    ? Response.json({ ok: true, models: [{ key: 'family-sonnet', label: 'Sonnet 5.5', fixed_effort: 'medium' }] })
    : new Response('event: delta\ndata: {"t":"text","d":"Report ready."}\n\nevent: done\ndata: {}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }))
  vi.stubGlobal('fetch', fetcher)
  Element.prototype.scrollTo ||= () => {}
  const { h, render } = await import('preact')
  const { act } = await import('preact/test-utils')
  const { AiReport } = await import('../../src/components/AiReport.jsx')
  const root = document.createElement('div')
  document.body.append(root)
  try {
    await act(async () => render(h(AiReport, { buildPrompt: async () => ({ system: 'Research', prompt: 'Summarize supplied data.' }) }), root))
    const generate = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === 'generate')
    expect(generate.disabled).toBe(false)
    await act(async () => generate.click())
    await vi.waitFor(() => expect(root.textContent).toContain('Report ready.'))
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('https://proxy.example.test/family-ai/'))).toBe(true)
  } finally {
    await act(async () => render(null, root))
    root.remove()
  }
})

it('uses the family transport for memory edits from the full chat UI', async () => {
  await family()
  const fetcher = vi.fn(async () => Response.json({ ok: true, text: '[{"op":"add","text":"Prefers concise summaries."}]' }))
  vi.stubGlobal('fetch', fetcher)
  const { h, render } = await import('preact')
  const { act } = await import('preact/test-utils')
  const { MemoryComposer } = await import('../../src/pages/chat.jsx')
  const root = document.createElement('div')
  document.body.append(root)
  try {
    await act(async () => render(h(MemoryComposer, { memories: [], onApplied: () => {} }), root))
    const input = root.querySelector('textarea,input')
    await act(async () => { input.value = 'Remember concise summaries'; input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => root.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://proxy.example.test/family-ai/api/chat')
    expect(options.headers.Authorization).toBe(`Bearer ${'a'.repeat(32)}`)
  } finally { await act(async () => render(null, root)); root.remove() }
})

it('keeps memory drafts editable during IME composition and submits only explicitly',async()=>{
 await family()
 let complete
 const fetcher=vi.fn(()=>new Promise(resolve=>{complete=()=>resolve(Response.json({ok:true,text:'[{"op":"add","text":"Concise summaries."}]'}))}))
 vi.stubGlobal('fetch',fetcher)
 sessionStorage.setItem('chat_context_once',JSON.stringify({label:'article',data:{title:'Example'}}))
 const {h,render}=await import('preact'),{act}=await import('preact/test-utils')
 const {MemoryComposer}=await import('../../src/pages/chat.jsx')
 const root=document.createElement('div');document.body.append(root)
 try{
  await act(()=>render(h(MemoryComposer,{memories:[],onApplied:()=>{}}),root))
  expect(sessionStorage.getItem('chat_context_once')).not.toBeNull()
  const input=root.querySelector('textarea')
  expect(input.placeholder).toBe('Describe what you want to remember…')
  await act(()=>{input.value='Remember concise summaries';input.dispatchEvent(new Event('input',{bubbles:true}))})
  await act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})))
  await act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
  expect(fetcher).not.toHaveBeenCalled()
  await act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true})))
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(root.querySelector('button[aria-busy="true"] .brand-spinner')).not.toBeNull()
  await act(async()=>complete())
  await vi.waitFor(()=>expect(root.textContent).toContain('changes applied'))
 }finally{await act(()=>render(null,root));root.remove();sessionStorage.clear()}
})

it('sends Opus through the family transport at its approved low effort',async()=>{
  const chat=await family()
  const fetcher=vi.fn(async()=>Response.json({ok:true,text:'Done'}));vi.stubGlobal('fetch',fetcher)
  await chat.wireComplete({model:'family-opus',effort:'high',messages:[{role:'user',content:'Hello'}]})
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({model:'family-opus',effort:'low'})
})

it('uses the selected family portfolio as chat context without calling a broker',async()=>{
  await family()
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
  const {replacePortfolios}=await import('../../src/lib/myPortfolios.js')
  replacePortfolios([{id:'p1',name:'First portfolio',ccy:'USD',holdings:[{symbol:'AAPL',shares:10,cost:100}]},
    {id:'p2',name:'Second portfolio',ccy:'USD',holdings:[{symbol:'MSFT',shares:20,cost:200}]}])
  localStorage.setItem('my_portfolio_sel_v1','p2')
  const context=await import('../../src/lib/chatContext.js')
  expect(context.hasLiveBook()).toBe(true)
  expect((await context.fetchBookJson()).positions.map(p=>p.symbol)).toEqual(['MSFT'])
  const block=await context.buildChatContext('Explain my holdings')
  expect(block).toContain('SAVED PORTFOLIO')
  expect(block).toContain('MSFT: 20 shares')
  expect(block).not.toContain('AAPL: 10 shares')
  expect(fetcher).not.toHaveBeenCalled()
})

it('keeps selected holdings in context when a quote lacks a daily change',async()=>{
  await family()
  const {replacePortfolios}=await import('../../src/lib/myPortfolios.js')
  replacePortfolios([{id:'p1',name:'Example portfolio',ccy:'USD',holdings:[{symbol:'AAPL',shares:10,cost:100}]}])
  const feed=await import('../../src/lib/feed.js')
  const quote=vi.spyOn(feed,'getCached').mockReturnValue({quote:{price:12,currency:'CAD'}})
  try {
    const context=await import('../../src/lib/chatContext.js')
    const block=await context.buildChatContext('Explain my holdings')
    expect(block).toContain('12.00 CAD')
    expect(block).toContain('AAPL: 10 shares')
  } finally {quote.mockRestore()}
})

it('opens family at the shared portfolio and leaves the main default intact',async()=>{
 await family()
 expect((await import('../../src/lib/nav.js')).DEFAULT_SECTION).toBe('portfolio')
 vi.resetModules()
 await family(true,false)
 expect((await import('../../src/lib/nav.js')).DEFAULT_SECTION).toBe('dashboard')
})

it('compacts memories through the family transport and offers undo',async()=>{
 await family()
 const {loadMemories}=await import('../../src/lib/chatMemory.js')
 localStorage.setItem('chat_memories_v1',JSON.stringify(['Concise summaries.','Keep summaries concise.','Use USD.','Cite sources.'].map((text,i)=>({id:i+1,text,ts:1000}))))
 const original=loadMemories()
 const fetcher=vi.fn(async()=>Response.json({ok:true,text:'[{"op":"edit","id":1,"text":"Keep summaries concise."},{"op":"delete","id":2}]'}))
 vi.stubGlobal('fetch',fetcher)
 const {h,render}=await import('preact'),{act}=await import('preact/test-utils')
 const {MemoryComposer}=await import('../../src/pages/chat.jsx')
 const root=document.createElement('div');document.body.append(root)
 try{
  await act(()=>render(h(MemoryComposer,{memories:original,onApplied:()=>{}}),root))
  await act(async()=>[...root.querySelectorAll('button')].find(b=>b.textContent==='Compact').click())
  await vi.waitFor(()=>expect(loadMemories()).toHaveLength(3))
  expect(JSON.parse(fetcher.mock.calls[0][1].body).messages[0].content).toContain('Preserve all distinct facts')
  await act(()=>[...root.querySelectorAll('button')].find(b=>b.textContent==='Undo').click())
  expect(loadMemories().map(m=>m.text).sort()).toEqual(original.map(m=>m.text).sort())
 }finally{await act(()=>render(null,root));root.remove()}
})
it('supplies a catalog of every saved portfolio without restricting chat to the selected tab',async()=>{
 await family();vi.stubGlobal('fetch',vi.fn())
 const {replacePortfolios}=await import('../../src/lib/myPortfolios.js')
 replacePortfolios([{id:'p1',name:'Long term',ccy:'HKD',holdings:[{symbol:'AAPL',shares:10,cost:100}],cash:[{ccy:'HKD',amount:500}]},
 {id:'p2',name:'Income',ccy:'CNY',holdings:[{symbol:'MSFT',shares:20,cost:200}]},
 {id:'p3',name:'Long term USD',ccy:'USD',holdings:[{symbol:'GOOGL',shares:5,cost:50}]}])
 localStorage.setItem('my_portfolio_sel_v1','p2')
 const block=await (await import('../../src/lib/chatContext.js')).buildChatContext('Which portfolios can you see?')
 expect(block).toContain('ALL SAVED PORTFOLIOS')
 for(const name of ['Long term','Income','Long term USD'])expect(block).toContain(name)
 expect(block).toContain('get_portfolio')
 expect(block).not.toContain('AAPL: 10 shares')
})


it('routes family Flash to its own model instead of silently choosing Sonnet',async()=>{
 const chat=await family();const fetcher=vi.fn(async()=>Response.json({ok:true,text:'Ready'}));vi.stubGlobal('fetch',fetcher)
 await chat.wireComplete({model:'family-flash',effort:'high',messages:[{role:'user',content:'Hello'}]})
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({model:'family-flash',effort:'low'})
})

it('retains rate-limit retry metadata from a failed stream',async()=>{
 const chat=await family();vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:false,error:'Assistant request limit reached.',code:'rate_limited',retry_after:9},{status:429})))
 await expect(chat.wireStream({model:'family-flash',messages:[]})).rejects.toMatchObject({status:429,code:'rate_limited',retryAfter:9})
})
it('never silently substitutes a completed answer when family streaming fails',async()=>{
 await family();const {runAgenticOverWire}=await import('../../src/lib/agent.js')
 const complete=vi.fn();const fail=Object.assign(Error('rate limit'),{status:429})
 await expect(runAgenticOverWire({model:'family-flash',system:'Task',messages:[{role:'user',content:'Hello'}]},{wireStream:async()=>{throw fail},wireComplete:complete})).rejects.toBe(fail)
 expect(complete).not.toHaveBeenCalled()
})

it('uses low effort when Argon is explicitly selected',async()=>{
 const chat=await family()
 const fetcher=vi.fn(async()=>Response.json({ok:true,text:'Done'}))
 vi.stubGlobal('fetch',fetcher)
 await chat.wireComplete({model:'family-flash',effort:'medium',messages:[{role:'user',content:'Hello'}]})
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({model:'family-flash',effort:'low'})
})
