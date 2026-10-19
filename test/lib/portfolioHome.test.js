import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../../src/lib/wirechat.js',()=>({wireChatAvailable:()=>true}))
vi.mock('../../src/lib/wire.js',async original=>({...await original(),wireUrl:()=> 'https://wire.example.test'}))
vi.mock('../../src/lib/zhNames.js',()=>({loadZhTable:async()=>null,zhName:()=>null}))
vi.mock('../../src/lib/cnEvents.js',()=>({fetchSymbolEventsCached:async()=>({nextResults:'2026-01-20'})}))
vi.mock('../../src/lib/portfolioNews.js',async original=>({...await original(),loadCompanyNews:async()=>({events:[],failed:[]}),loadPortfolioWire:async()=>[
 {id:1,type:'headline',headline:'Apple reports results',url:'https://reuters.com/a',ts_event:1000},
 {id:2,type:'headline',headline:'Microsoft reports results',url:'https://reuters.com/b',ts_event:1001},
]}))
import { PortfolioHome } from '../../src/components/PortfolioHome.jsx'
let root
afterEach(()=>{if(root){render(null,root);root.remove()}vi.useRealTimers();sessionStorage.clear()})
it('keeps headlines and dates scoped to the selected book and sends contextual questions to the common chat',async()=>{
 vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))
 root=document.createElement('div');document.body.append(root)
 const props=symbol=>({portfolio:{id:symbol,name:'Example portfolio',ccy:'USD',holdings:[{symbol,shares:10}]},quotes:{[symbol]:{name:symbol==='AAPL' ? 'Apple Inc.' : 'Microsoft Corp.'}},valuedRows:[{symbol,valueDisplay:100,dayPnlDisplay:5,dayPct:2}]})
 await act(async()=>render(h(PortfolioHome,props('AAPL')),root))
 await vi.waitFor(()=>expect(root.textContent).toContain('Apple reports results'))
 expect(root.textContent).not.toContain('Microsoft reports results')
 expect(root.querySelector('[data-home-dates]').textContent).toContain('01-20')
 await act(()=>root.querySelector('[data-ask-ai]').click())
 expect(location.hash).toBe('#/chat')
 expect(sessionStorage.getItem('chat_prefill')).toContain('Example portfolio')
 expect(JSON.parse(sessionStorage.getItem('chat_context_once')).data.portfolio_id).toBe('AAPL')
 expect(sessionStorage.getItem('chat_action_once')).not.toBeNull()
 expect(JSON.parse(sessionStorage.getItem('chat_context_once')).data.portfolio).toBe('Example portfolio')
 await act(async()=>render(h(PortfolioHome,props('MSFT')),root))
 await vi.waitFor(()=>expect(root.textContent).toContain('Microsoft reports results'))
 expect(root.textContent).not.toContain('Apple reports results')
 await act(()=>root.querySelector('[data-ask-ai]').click())
 expect(JSON.parse(sessionStorage.getItem('chat_context_once')).data.portfolio_id).toBe('MSFT')
})
