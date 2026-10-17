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
