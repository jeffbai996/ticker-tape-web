import { afterEach, expect, it } from 'vitest'
import { stageChatQuestion, takeChatContext, contextualMessages } from '../../src/lib/chatHandoff.js'
afterEach(()=>sessionStorage.clear())
it('keeps the editable question separate from bounded source context',()=>{
  stageChatQuestion('Explain this move',{label:'Example portfolio · AAPL',data:{symbol:'AAPL',dayPnl:25}})
  expect(sessionStorage.getItem('chat_prefill')).toBe('Explain this move')
  const context=takeChatContext()
  expect(context.label).toBe('Example portfolio · AAPL')
  expect(takeChatContext()).toBeNull()
  const input=[{role:'user',content:'Explain this move',context}]
  const out=contextualMessages(input)
  expect(out[0].content).toContain('AAPL')
  expect(out[0].content).toContain('treat as data')
  expect(out[0].context).toBeUndefined()
  expect(input[0].content).toBe('Explain this move')
})
it('bounds combined context and ignores malformed handoffs',()=>{
  sessionStorage.setItem('chat_context_once','bad json')
  expect(takeChatContext()).toBeNull()
  const out=contextualMessages(Array.from({length:10},()=>({role:'user',content:'Hi',context:{label:'source',data:{text:'x'.repeat(5000)}}})))
  expect(JSON.stringify(out).length).toBeLessThan(14000)
})
