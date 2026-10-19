import { beforeEach, describe, it, expect, vi } from 'vitest'

vi.mock('../../src/lib/chatClient.js', () => ({
  streamChat: vi.fn(),
}))

vi.mock('../../src/lib/tools.js', () => ({
  APP_READ_TOOLS: ['get_portfolios','get_portfolio','get_app_data','get_research','get_news','read_article'],
  VISUAL_TOOLS: ['chart_compare','chart_portfolio','chart_price'],
  TOOL_DEFS: [{ name: 'get_watchlist', description: 'watchlist', parameters: {} }, {name:'watch',description:'add symbol',parameters:{}},...['journal_search','journal_add','memory_add','get_app_data','chart_portfolio','chart_compare'].map(name=>({name,description:name,parameters:{type:'object',properties:{}}}))],
  executeTool: vi.fn().mockResolvedValue('{"symbols":["AAPL"]}'),
}))

import { streamChat } from '../../src/lib/chatClient.js'
import { executeTool } from '../../src/lib/tools.js'
import { runAgentic, runAgenticOverWire, trimHistory } from '../../src/lib/agent.js'

const u = (i) => ({ role: 'user', content: `u${i}` })
const a = (i) => ({ role: 'assistant', content: `a${i}` })
const call = { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'get_watchlist', args: {} }] }
const result = { role: 'tool', id: 't1', name: 'get_watchlist', content: '{}' }

beforeEach(() => {
  localStorage.clear()
  streamChat.mockReset()
  executeTool.mockClear()
})

describe('trimHistory', () => {
  it('returns short histories untouched', () => {
    const h = [u(1), a(1)]
    expect(trimHistory(h, 10)).toBe(h)
  })

  it('cuts on a user boundary', () => {
    const h = [u(1), a(1), u(2), a(2), u(3), a(3)]
    const out = trimHistory(h, 4)
    expect(out).toEqual([u(2), a(2), u(3), a(3)])
    expect(out[0].role).toBe('user')
  })

  it('never separates a tool call from its result', () => {
    const h = [u(1), a(1), u(2), call, result, a(2)]
    // max 4 would naively cut inside the tool exchange (at `call`)
    const out = trimHistory(h, 4)
    expect(out[0].role).toBe('user')
    const callIdx = out.findIndex((m) => m.toolCalls)
    const resIdx = out.findIndex((m) => m.role === 'tool')
    expect(callIdx === -1 ? resIdx === -1 : resIdx > callIdx).toBe(true)
  })

  it('falls back to the last user turn when no boundary is in range', () => {
    const h = [u(1), call, result, result, result, result, a(1)]
    const out = trimHistory(h, 3)
    expect(out[0]).toEqual(u(1))
  })
})

describe('queued follow-ups', () => {
  it('slides a queued message in before the next tool round', async () => {
    streamChat
      .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 't1', name: 'get_watchlist', args: {} }] })
      .mockResolvedValueOnce({ text: 'done', toolCalls: [] })
    const takeFollowUps = vi.fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ role: 'user', content: 'also compare margins' }])

    await runAgentic({
      model: 'flash', effort: 'high', system: 'system',
      messages: [{ role: 'user', content: 'analyze AAPL' }],
      takeFollowUps,
    })

    expect(streamChat).toHaveBeenCalledTimes(2)
    expect(streamChat.mock.calls[1][0].messages.at(-1)).toEqual({
      role: 'user', content: 'also compare margins',
    })
  })

  it('preserves the order of multiple follow-ups and consumes them once', async () => {
    streamChat
      .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 't1', name: 'get_watchlist', args: {} }] })
      .mockResolvedValueOnce({ text: 'done', toolCalls: [] })
    const takeFollowUps = vi.fn()
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        { role: 'user', content: 'first follow-up' },
        { role: 'user', content: 'second follow-up' },
      ])

    const added = await runAgentic({
      model: 'flash', effort: 'high', system: 'system',
      messages: [{ role: 'user', content: 'start' }],
      takeFollowUps,
    })

    expect(added.filter((m) => m.role === 'user').map((m) => m.content)).toEqual([
      'first follow-up', 'second follow-up',
    ])
    expect(takeFollowUps).toHaveBeenCalledTimes(2)
  })
})

describe('agent trace lifecycle', () => {
  it('reports each model round and tool boundary in execution order', async () => {
    streamChat
      .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 't1', name: 'get_watchlist', args: {} }] })
      .mockResolvedValueOnce({ text: 'done', toolCalls: [] })
    const events = []

    await runAgentic({
      model: 'flash', effort: 'high', system: 'system',
      messages: [{ role: 'user', content: 'analyze AAPL' }],
      onTrace: (event) => events.push(event),
    })

    expect(events.map((event) => event.type)).toEqual([
      'model_start', 'model_done', 'tool_start', 'tool_done',
      'model_start', 'model_done',
    ])
    expect(events[2]).toMatchObject({
      type: 'tool_start', round: 0, id: 't1', name: 'get_watchlist', args: {},
    })
    expect(events[3]).toMatchObject({ type: 'tool_done', result: '{"symbols":["AAPL"]}' })
    expect(events[4]).toMatchObject({ type: 'model_start', round: 1 })
  })

  it('reports tool failures before propagating them', async () => {
    streamChat.mockResolvedValueOnce({
      text: '', toolCalls: [{ id: 't1', name: 'get_watchlist', args: {} }],
    })
    executeTool.mockRejectedValueOnce(new Error('quote feed down'))
    const events = []

    await expect(runAgentic({
      model: 'flash', effort: 'high', system: 'system',
      messages: [{ role: 'user', content: 'analyze AAPL' }],
      onTrace: (event) => events.push(event),
    })).rejects.toThrow('quote feed down')

    expect(events.at(-1)).toMatchObject({
      type: 'tool_error', id: 't1', name: 'get_watchlist', error: 'quote feed down',
    })
  })
})

describe('private wire agent loop', () => {
  it('continues after a tool-backed planning stub and keeps it out of chat', async () => {
    const wireStream = vi.fn()
      .mockResolvedValueOnce({ text: '{"tool":"get_watchlist","args":{}}' })
      .mockResolvedValueOnce({ text: 'I need the current tape before answering.' })
      .mockResolvedValueOnce({ text: 'AAPL leads the list; watch the next earnings print.' })
    const runTool = vi.fn().mockResolvedValue('{"symbols":["AAPL"]}')
    const rounds = []
    const trace = vi.fn()

    const added = await runAgenticOverWire({
      model: 'gpt-terra', effort: 'high', system: 'system',
      messages: [{ role: 'user', content: 'What should I watch?' }],
      onRound: (entries) => rounds.push(entries),
      onTrace: trace,
    }, {
      wireStream,
      wireComplete: vi.fn(),
      executeTool: runTool,
    })

    expect(wireStream).toHaveBeenCalledTimes(3)
    expect(runTool).toHaveBeenCalledWith('get_watchlist', {}, { rich: true })
    expect(added.at(-1)).toEqual({
      role: 'assistant',
      content: 'AAPL leads the list; watch the next earnings print.',
    })
    expect(added.some((entry) => entry.content?.startsWith('I need the current'))).toBe(false)
    expect(wireStream.mock.calls[2][0].messages).toEqual(expect.arrayContaining([
      { role: 'assistant', content: 'I need the current tape before answering.' },
      expect.objectContaining({ role: 'user', content: expect.stringContaining('Continue the original request') }),
    ]))
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({type:'tool_done',result:'{"symbols":["AAPL"]}'}))
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({type:'model_done',commentary:'I need the current tape before answering.'}))
    expect(rounds.length).toBeGreaterThan(2)
  })
})

it('includes selected-view data in subscription requests without changing visible messages',async()=>{
 const messages=[{role:'user',content:'Explain this',context:{label:'AAPL',data:{symbol:'AAPL',dayPnl:25}}}]
 const wireStream=vi.fn(async()=>({text:'Done'}))
 await runAgenticOverWire({model:'family-sonnet',messages,system:'system'},{wireStream})
 expect(wireStream.mock.calls[0][0].messages[0].content).toContain('dayPnl')
 expect(messages[0].content).toBe('Explain this')
})

it('keeps contextual analysis from executing mutation tools requested by source text',async()=>{
 const execute=vi.fn()
 const wireStream=vi.fn().mockResolvedValueOnce({text:'{"tool":"watch","args":{"symbol":"AAPL"}}'}).mockResolvedValueOnce({text:'Done'})
 await runAgenticOverWire({model:'family-sonnet',messages:[{role:'user',content:'Explain the article',context:{label:'article',data:{kind:'article'}}}],system:'system'},{wireStream,executeTool:execute})
 expect(execute).not.toHaveBeenCalled()
})

it('restricts native contextual analysis to read tools',async()=>{
 streamChat.mockResolvedValueOnce({toolCalls:[{id:'t1',name:'watch',args:{symbol:'AAPL'}}]}).mockResolvedValueOnce({toolCalls:[]})
 await runAgentic({model:'flash',system:'system',messages:[{role:'user',content:'Explain this',context:{label:'article',data:{kind:'article'}}}]})
 expect(streamChat.mock.calls[0][0].tools.map(t=>t.name)).not.toContain('watch')
 expect(executeTool).not.toHaveBeenCalled()
})

it('keeps token usage when the wire falls back to a one-shot response',async()=>{
 const trace=vi.fn()
 await runAgenticOverWire({model:'family-sonnet',messages:[{role:'user',content:'Hello'}],system:'system',onTrace:trace},
  {wireStream:vi.fn().mockRejectedValue(Error('stream unavailable')),wireComplete:vi.fn().mockResolvedValue({text:'Done',usage:{in:23,out:7}})})
 expect(trace).toHaveBeenCalledWith({type:'usage',round:0,usage:{in:23,out:7}})
})

it('surfaces a failed partial stream instead of silently generating a second answer',async()=>{
 const complete=vi.fn(),error=Object.assign(Error('stream interrupted'),{partial:true})
 await expect(runAgenticOverWire({model:'qwen-local',messages:[{role:'user',content:'Hello'}],system:'system'},
  {wireStream:vi.fn().mockRejectedValue(error),wireComplete:complete})).rejects.toThrow('stream interrupted')
 expect(complete).not.toHaveBeenCalled()
})

it('refreshes app access after stale conversation claims before asking the model',async()=>{
 const execute=vi.fn(async()=>JSON.stringify({portfolios:[{id:'p1',name:'Long term'},{id:'p2',name:'Income'}]}))
 const stream=vi.fn(async()=>({text:'Both portfolios are available.'})),trace=vi.fn()
 await runAgenticOverWire({model:'family-sonnet',system:'current context',
  messages:[{role:'assistant',content:'I can only see the selected portfolio.'},{role:'user',content:'You should see the others now.'}],
  initialTools:[{name:'get_portfolios',args:{}}],onTrace:trace},
  {wireStream:stream,executeTool:execute})
 expect(execute).toHaveBeenCalledWith('get_portfolios',{},{rich:true})
 expect(stream.mock.calls[0][0].messages.at(-1).content).toContain('TOOL_RESULT get_portfolios:')
 expect(stream.mock.calls[0][0].messages.at(-1).content).toContain('Long term')
 expect(trace).toHaveBeenCalledWith(expect.objectContaining({type:'tool_done',name:'get_portfolios',result:await execute.mock.results[0].value}))
})

it('allows a multi-book review to finish its required reads before answering',async()=>{
 let calls=0
 const wireStream=vi.fn(async()=>({text:++calls<=9?'{"tool":"get_watchlist","args":{}}':'Review complete.'}))
 const added=await runAgenticOverWire({model:'family-sonnet',system:'Review all requested books',messages:[{role:'user',content:'Review the accounts'}]},{wireStream,executeTool:async()=>'{"ok":true}'})
 expect(wireStream).toHaveBeenCalledTimes(10);expect(added.at(-1).content).toBe('Review complete.')
})

it('shares one turn identity across model rounds and assigns queued sends their own IDs',async()=>{
 const requests=[];let follow=true
 await runAgenticOverWire({model:'test',system:'Task',messages:[{role:'user',content:'Hello'}],takeFollowUps:()=>follow?(follow=false,[{role:'user',content:'One followup'}]):[]},
 {executeTool:async()=> 'Result',wireStream:async request=>{requests.push(request);return {text:requests.length===1?'{"tool":"get_watchlist","args":{}}':'Done'}}})
 expect(requests).toHaveLength(2)
 expect(requests[0].turnId).toMatch(/^[a-f0-9]{32}$/)
 expect(requests[1].turnId).toBe(requests[0].turnId)
 expect(requests[1].sendIds).toHaveLength(2)
})

it('never executes more than twelve tools even when initial context tools fill the budget',async()=>{
 const execute=vi.fn(async()=> 'Result')
 await expect(runAgenticOverWire({model:'test',system:'Task',messages:[{role:'user',content:'Hello'}],initialTools:Array.from({length:13},()=>({name:'get_portfolios',args:{}}))},
 {executeTool:execute,wireStream:async()=>({text:'Done'})})).rejects.toThrow('tool-call limit')
 expect(execute).toHaveBeenCalledTimes(12)
})

it('keeps the fallback model for subsequent tool rounds and forwards its identity',async()=>{
 const trace=vi.fn(),fallback={key:'family-flash',label:'4 Argon',effort:'medium',fallback_from:'family-opus',reason:'provider_limit'}
 const stream=vi.fn().mockImplementationOnce(async options=>{
  options.onModel(fallback)
  return {text:'{"tool":"get_watchlist","args":{}}'}
 }).mockResolvedValueOnce({text:'Complete'})
 await runAgenticOverWire({model:'family-opus',effort:'low',system:'Selected model: Opus',messages:[{role:'user',content:'Review'}],onTrace:trace},
  {wireStream:stream,executeTool:vi.fn(async()=>'{}')})
 expect(stream.mock.calls[1][0]).toMatchObject({model:'family-flash',effort:'medium'})
 expect(stream.mock.calls[1][0].system).toContain('4 Argon')
 expect(trace).toHaveBeenCalledWith(expect.objectContaining({type:'model',...fallback}))
})
it('blocks note reads and writes in temporary subscription chats while retaining market tools',async()=>{
 const execute=vi.fn(async()=>'{"symbols":["AAPL"]}')
 const stream=vi.fn()
 for(const [name,args] of [['journal_search',{}],['get_app_data',{topic:'memories'}],['get_app_data',{}],['memory_add',{text:'Secret'}],['get_watchlist',{}]])stream.mockResolvedValueOnce({text:JSON.stringify({tool:name,args})})
 stream.mockResolvedValue({text:'Done'})
 await runAgenticOverWire({model:'family-sonnet',temporary:true,messages:[{role:'user',content:'Question'}],system:'system'},{wireStream:stream,executeTool:execute})
 expect(execute.mock.calls).toEqual([['get_watchlist',{},{rich:true}]])
 expect(JSON.stringify(stream.mock.calls.at(-1)[0].messages)).toContain('unavailable in incognito')
})
it('blocks note access even when a native model requests an unadvertised tool',async()=>{
 streamChat.mockResolvedValueOnce({toolCalls:[{id:'a',name:'journal_add',args:{text:'Private'}},{id:'b',name:'get_app_data',args:{topic:'journal'}}]}).mockResolvedValueOnce({toolCalls:[]})
 await runAgentic({model:'flash',temporary:true,system:'system',messages:[{role:'user',content:'Question'}]})
 expect(streamChat.mock.calls[0][0].tools.map(t=>t.name)).not.toContain('journal_add')
 expect(streamChat.mock.calls[0][0].tools.find(t=>t.name==='get_app_data').parameters.properties.topic.enum).toEqual(['watchlists','alerts','screens'])
 expect(executeTool).not.toHaveBeenCalled()
})

describe('visual tool blocks', () => {
  const block = { v: 1, type: 'bars', id: 'contrib', title: 'Example growth', items: [{ key: 'AAPL', value: 1 }] }
  it('keeps a chart block on the tool record over the wire and sends the model only the summary', async () => {
    const execute = vi.fn(async (name) => (name === 'chart_portfolio' ? { content: '{"chart":"shown"}', block } : '{"ok":true}'))
    const stream = vi.fn().mockResolvedValueOnce({ text: '{"tool":"chart_portfolio","args":{"portfolio":"book-2","view":"contributors"}}' }).mockResolvedValueOnce({ text: 'AAPL carried the day.' })
    const trace = vi.fn()
    const added = await runAgenticOverWire({ model: 'family-sonnet', system: 'sys', messages: [{ role: 'user', content: 'Explain the book' }], onTrace: trace }, { wireStream: stream, executeTool: execute })
    expect(execute).toHaveBeenCalledWith('chart_portfolio', { portfolio: 'book-2', view: 'contributors' }, { rich: true })
    const record = added.find((m) => m.role === 'tool')
    expect(record).toEqual({ role: 'tool', id: 'w0', name: 'chart_portfolio', content: '{"chart":"shown"}', block })
    expect(JSON.stringify(stream.mock.calls[1][0].messages)).not.toContain('"block"')
    expect(stream.mock.calls[1][0].messages.at(-1).content).toContain('TOOL_RESULT chart_portfolio: {"chart":"shown"}')
    expect(trace).toHaveBeenCalledWith(expect.objectContaining({ type: 'tool_done', name: 'chart_portfolio', result: '{"chart":"shown"}' }))
  })
  it('runs a contextual chart as an initial read and refuses tools outside the read-only set', async () => {
    const execute = vi.fn(async (name) => (name === 'chart_portfolio' ? { content: '{"chart":"shown"}', block } : '{"book":true}'))
    const added = await runAgenticOverWire({ model: 'family-sonnet', system: 'sys', messages: [{ role: 'user', content: 'Explain' }],
      initialTools: [{ name: 'get_portfolio', args: { portfolio: 'book-2' } }, { name: 'chart_portfolio', args: { portfolio: 'book-2', view: 'contributors' } }] },
    { wireStream: async () => ({ text: 'Done' }), executeTool: execute })
    expect(added.filter((m) => m.role === 'tool').map((m) => !!m.block)).toEqual([false, true])
    await expect(runAgenticOverWire({ model: 'family-sonnet', system: 'sys', messages: [{ role: 'user', content: 'Explain' }], initialTools: [{ name: 'watch', args: { symbol: 'AAPL' } }] },
      { wireStream: async () => ({ text: 'Done' }), executeTool: execute })).rejects.toThrow('read-only')
  })
  it('carries the block on the native tool path too', async () => {
    executeTool.mockResolvedValueOnce({ content: '{"chart":"shown"}', block })
    streamChat
      .mockResolvedValueOnce({ text: '', toolCalls: [{ id: 'n1', name: 'chart_compare', args: { symbols: ['AAPL', 'MSFT'] } }] })
      .mockResolvedValueOnce({ text: 'done', toolCalls: [] })
    const added = await runAgentic({ model: 'flash', effort: 'high', system: 'system', messages: [{ role: 'user', content: 'compare' }] })
    expect(executeTool).toHaveBeenCalledWith('chart_compare', { symbols: ['AAPL', 'MSFT'] }, { rich: true })
    expect(added.find((m) => m.role === 'tool')).toMatchObject({ content: '{"chart":"shown"}', block })
    expect(JSON.stringify(streamChat.mock.calls[1][0].messages)).not.toContain('"block"')
  })
  it('still accepts a plain string from an executor that knows nothing about blocks', async () => {
    const added = await runAgenticOverWire({ model: 'family-sonnet', system: 'sys', messages: [{ role: 'user', content: 'Hi' }] },
      { wireStream: vi.fn().mockResolvedValueOnce({ text: '{"tool":"get_watchlist","args":{}}' }).mockResolvedValueOnce({ text: 'Done' }), executeTool: async () => '{"symbols":[]}' })
    expect(added.find((m) => m.role === 'tool')).toEqual({ role: 'tool', id: 'w0', name: 'get_watchlist', content: '{"symbols":[]}' })
  })
})
