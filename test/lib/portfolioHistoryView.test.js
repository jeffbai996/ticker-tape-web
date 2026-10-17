import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { PortfolioHistory } from '../../src/components/PortfolioHistory.jsx'
const service=vi.hoisted(()=>({state:{configured:false}}))
vi.mock('../../src/hooks/usePortfolioHistory.js',()=>({usePortfolioHistory:()=>({...service.state,refresh:()=>{}})}))
let root
afterEach(()=>{service.state={configured:false};if(root){render(null,root);root.remove()}})
it('opens a dated explorer and scrubs its figures without changing the portfolio',async()=>{
  const marks=[{d:'2026-01-01',v:100,c:'USD'},{d:'2026-01-10',v:120,c:'USD'},{d:'2026-01-20',v:110,c:'USD'}]
  const original=JSON.stringify(marks)
  root=document.createElement('div');document.body.append(root)
  await act(()=>render(h(PortfolioHistory,{marks,ccy:'USD',name:'Example portfolio',cashTxns:[]}),root))
  await act(()=>root.querySelector('[data-history-open]').click())
  expect(root.querySelector('[role="dialog"]')).not.toBeNull()
  const slider=root.querySelector('input[type="range"]')
  await act(()=>{slider.value='1';slider.dispatchEvent(new Event('input',{bubbles:true}))})
  expect(root.querySelector('[data-history-date]').textContent).toContain('2026-01-10')
  expect(root.querySelector('[data-history-value]').textContent).toContain('120')
  expect(JSON.stringify(marks)).toBe(original)
})
it('supports keyboard inspection of the compact line and keeps an empty history quiet',async()=>{
  root=document.createElement('div');document.body.append(root)
  await act(()=>render(h(PortfolioHistory,{marks:[],ccy:'USD'}),root))
  expect(root.querySelector('button')).toBeNull()
  const onInspect=vi.fn()
  await act(()=>render(h(PortfolioHistory,{marks:[{d:'2026-01-01',v:100,c:'USD'},{d:'2026-01-02',v:110,c:'USD'}],ccy:'USD',onInspect}),root))
  const opener=root.querySelector('[data-history-open]')
  await act(()=>opener.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})))
  expect(root.querySelector('[role="tooltip"]')).toBeNull()
  expect(onInspect).toHaveBeenLastCalledWith(expect.objectContaining({d:'2026-01-01',v:100}))
  await act(()=>opener.dispatchEvent(new Event('pointerleave',{bubbles:true})))
  expect(onInspect).toHaveBeenLastCalledWith(null)
})

it('scrubs the hero value and restores its live figures when inspection ends',async()=>{
  const { SummaryStrip }=await import('../../src/pages/portfolioMine.jsx')
  root=document.createElement('div');document.body.append(root)
  const portfolio={id:'p1',name:'Example portfolio',ccy:'USD',holdings:[{symbol:'AAPL',shares:10,cost:10}],cash:[],snapshots:[{d:'2026-01-01',v:100,c:'USD'},{d:'2026-01-02',v:150,c:'USD'}]}
  const props={portfolio,quotes:{AAPL:{price:20,pct:1,currency:'USD'}},rates:{USD:1},ccys:['USD'],fxLive:{},bench:{}}
  await act(()=>render(h(SummaryStrip,props),root))
  const value=()=>root.querySelector('[data-portfolio-value]').textContent
  expect(value()).toContain('200')
  const opener=root.querySelector('[data-history-open]')
  await act(()=>opener.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})))
  expect(value()).toContain('100')
  expect(root.querySelector('[data-portfolio-value-date]').textContent).toContain('2026-01-01')
  await act(()=>opener.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})))
  expect(value()).toContain('150')
  expect(root.textContent).toContain('+50.00%')
  expect(root.querySelector('[role="tooltip"]')).toBeNull()
  await act(()=>opener.dispatchEvent(new Event('pointerleave',{bubbles:true})))
  expect(value()).toContain('200')
  expect(root.querySelector('[data-portfolio-value-date]')).toBeNull()
})

it('restores collected cash and costs while scrubbing server history',async()=>{
 const {SummaryStrip}=await import('../../src/pages/portfolioMine.jsx')
 service.state={configured:true,data:{marks:[
  {d:'2026-01-01',v:100,c:'USD',source:'collector',cash:'40',cost:'50',unrealized:'10'},
  {d:'2026-01-02',v:120,c:'USD',source:'collector',cash:'30',cost:'60',unrealized:'30'}
 ]}}
 root=document.createElement('div');document.body.append(root)
 await act(()=>render(h(SummaryStrip,{portfolio:{id:'p1',name:'Example',ccy:'USD',holdings:[],cash:[],snapshots:[]},quotes:{},rates:{USD:1},ccys:['USD'],fxLive:{},bench:{} }),root))
 const line=root.querySelector('[data-history-open]')
 await act(()=>line.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})))
 expect(root.querySelector('[data-portfolio-value]').textContent).toContain('100')
 expect(root.textContent).toContain('40')
 expect(root.textContent).toContain('50')
 expect(root.textContent).not.toContain('Current Cost basis')
})
