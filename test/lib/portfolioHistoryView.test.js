import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, it } from 'vitest'
import { PortfolioHistory } from '../../src/components/PortfolioHistory.jsx'
let root
afterEach(()=>{if(root){render(null,root);root.remove()}})
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
  await act(()=>render(h(PortfolioHistory,{marks:[{d:'2026-01-01',v:100,c:'USD'},{d:'2026-01-02',v:110,c:'USD'}],ccy:'USD'}),root))
  const opener=root.querySelector('[data-history-open]')
  await act(()=>opener.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true})))
  expect(root.querySelector('[role="tooltip"]').textContent).toContain('2026-01-01')
})
