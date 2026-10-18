import {afterEach,expect,it,vi} from 'vitest'
import {h,render} from 'preact'
import {act} from 'preact/test-utils'
const state=vi.hoisted(()=>({cache:{},fetch:vi.fn(),ready:Promise.resolve()}))
vi.mock('../../src/lib/fundamentals.js',()=>({peekEarningsDate:s=>state.cache[s],fetchEarningsDate:s=>state.fetch(s)}))
vi.mock('../../src/lib/feed.js',()=>({whenFirstBatch:()=>state.ready}))
import {useEarningsDays} from '../../src/hooks/useEarningsDays.js'
let root
function View({symbols}){return h('output',null,JSON.stringify(useEarningsDays(symbols)))}
afterEach(()=>{if(root){render(null,root);root.remove()}vi.restoreAllMocks()})
it('paints cached dates on the first render even while prices are pending',()=>{
 state.cache={AAPL:{date:Date.now()+3*86400000}};state.ready=new Promise(()=>{})
 root=document.createElement('div');render(h(View,{symbols:['AAPL','MSFT']}),root)
 expect(JSON.parse(root.textContent)).toEqual({AAPL:3})
})
it('publishes cold results together and preserves old dates when a refresh fails',async()=>{
 state.cache={AAPL:{date:Date.now()+3*86400000}};state.ready=Promise.resolve()
 let release;state.fetch=vi.fn(s=>s==='AAPL'?Promise.reject(Error('offline')):new Promise(resolve=>{release=resolve}))
 root=document.createElement('div');await act(()=>render(h(View,{symbols:['AAPL','MSFT']}),root))
 expect(JSON.parse(root.textContent)).toEqual({AAPL:3})
 await act(()=>release({date:Date.now()+5*86400000}))
 await vi.waitFor(async()=>{await act(async()=>{});expect(JSON.parse(root.textContent)).toEqual({AAPL:3,MSFT:5})})
})
it('keeps concurrency bounded and does not reveal a partial cold batch',async()=>{
 state.cache={};state.ready=Promise.resolve();const pending=[]
 state.fetch=vi.fn(s=>new Promise(resolve=>pending.push({s,resolve})))
 root=document.createElement('div');await act(()=>render(h(View,{symbols:['AAPL','MSFT','GOOGL','AMZN','META']}),root))
 expect(pending).toHaveLength(4)
 await act(()=>pending[0].resolve({date:Date.now()+2*86400000}))
 expect(pending).toHaveLength(5);expect(JSON.parse(root.textContent)).toEqual({})
 await act(()=>Promise.all(pending.slice(1).map(p=>p.resolve({date:Date.now()+2*86400000}))))
 await vi.waitFor(async()=>{await act(async()=>{});expect(Object.keys(JSON.parse(root.textContent))).toHaveLength(5)})
})
it('switches to the next source cache immediately without leaking the preceding source dates',()=>{
 state.cache={AAPL:{date:Date.now()+3*86400000},MSFT:{date:Date.now()+7*86400000}};state.ready=new Promise(()=>{})
 root=document.createElement('div');render(h(View,{symbols:['AAPL']}),root)
 render(h(View,{symbols:['MSFT']}),root)
 expect(JSON.parse(root.textContent)).toEqual({MSFT:7})
})
