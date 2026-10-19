import { afterEach, expect, it } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { ActivityTrace } from '../../src/pages/chat.jsx'
let root
afterEach(()=>{if(root){render(null,root);root.remove()}})
it('renders one tool row under its reasoning phase and keeps errors visible',async()=>{
  root=document.createElement('div');document.body.append(root)
  const steps=[{key:'m',kind:'model',label:'Reasoned',status:'done',startedAt:1000,endedAt:2000},
    {key:'t1',kind:'tool',label:'Reading technicals AAPL',status:'done',startedAt:2000,endedAt:3000},
    {key:'t2',kind:'tool',label:'Reading technicals MSFT',status:'error',detail:'Data unavailable',startedAt:3000,endedAt:4000}]
  await act(()=>render(h(ActivityTrace,{steps,busy:true,startedAt:1000}),root))
  expect(root.querySelectorAll('.chat-trace-phase')).toHaveLength(1)
  expect(root.querySelectorAll('.chat-trace-tools .chat-trace-step')).toHaveLength(2)
  expect(root.querySelectorAll('.chat-trace-reason')).toHaveLength(1)
  expect(root.querySelector('.is-error').textContent).toContain('Data unavailable')
  expect(root.textContent.split('Reading technicals AAPL')).toHaveLength(2)
})

it('opens reasoning and tool printouts from their rows and keeps them collapsed initially', async () => {
 root=document.createElement('div');document.body.append(root)
 const steps=[{key:'m',kind:'model',label:'Reasoned',status:'done',detail:'Compared the supplied sources.',startedAt:1000,endedAt:2000},
 {key:'t',kind:'tool',name:'get_earnings',label:'Checking AAPL earnings',status:'done',input:'{"symbol":"AAPL"}',output:'{"eps":2}',startedAt:2000,endedAt:2050}]
 await act(()=>render(h(ActivityTrace,{steps,busy:true,startedAt:1000}),root))
 const reasoning=root.querySelector('.chat-trace-reason details')
 const tool=root.querySelector('.chat-trace-step details')
 expect(reasoning.open).toBe(false);expect(tool.open).toBe(false)
 expect(reasoning.querySelector('summary').textContent).toContain('Reasoned')
 await act(()=>reasoning.querySelector('summary').click())
 expect(reasoning.open).toBe(true)
 expect(reasoning.textContent).toContain('Compared the supplied sources.')
 await act(()=>tool.querySelector('summary').click())
 expect(tool.open).toBe(true)
 expect([...tool.querySelectorAll('pre')].map(el=>el.textContent)).toEqual(['{"symbol":"AAPL"}','{"eps":2}'])
})
it('keeps streamed reasoning collapsed and preserves an opened row across updates', async () => {
 root=document.createElement('div');document.body.append(root)
 const step={key:'m',kind:'model',label:'Thinking',status:'running',detail:'Reading supplied data.',startedAt:1000}
 await act(()=>render(h(ActivityTrace,{steps:[step],busy:true,startedAt:1000}),root))
 const details=root.querySelector('.chat-trace-reason details')
 expect(details.open).toBe(false)
 await act(()=>details.querySelector('summary').click())
 await act(()=>render(h(ActivityTrace,{steps:[{...step,detail:step.detail+' Comparing sources.'}],busy:true,startedAt:1000}),root))
 expect(details.open).toBe(true)
 expect(details.textContent).toContain('Comparing sources.')
})
it('does not invent reasoning text when only a token count is available', async () => {
 root=document.createElement('div');document.body.append(root)
 await act(()=>render(h(ActivityTrace,{steps:[{key:'m',kind:'model',label:'Reasoned',status:'done',thinkTokens:400}],busy:true}),root))
 expect(root.querySelector('.chat-trace-reason').textContent).toContain('400')
 expect(root.querySelector('.chat-trace-reason .chat-think')).toBeNull()
})
