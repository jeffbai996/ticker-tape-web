import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {replacePortfolios} from '../../src/lib/myPortfolios.js'
import {listChatPortfolios,readChatPortfolio,readChatAppData} from '../../src/lib/chatAppData.js'
const books=[
 {id:'p1',name:'Long term',ccy:'USD',holdings:[{symbol:'AAPL',shares:10,cost:100}],cash:[{ccy:'USD',amount:500}]},
 {id:'p2',name:'Income',ccy:'CNY',holdings:[{symbol:'MSFT',shares:20,cost:200}],cash:[{ccy:'CNY',amount:700}]},
 {id:'p3',name:'Long term USD',ccy:'USD',holdings:[{symbol:'GOOGL',shares:5,cost:50}]},
]
beforeEach(()=>{localStorage.clear();replacePortfolios(books);localStorage.setItem('my_portfolio_sel_v1','p2')})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();localStorage.clear()})
it('lists every saved book and reads a named unselected book without changing selection',async()=>{
 expect(listChatPortfolios().portfolios.map(p=>p.name)).toEqual(books.map(p=>p.name))
 const result=await readChatPortfolio({portfolio:'Long term USD',section:'holdings'})
 expect(result.portfolio.id).toBe('p3');expect(result.rows[0]).toMatchObject({symbol:'GOOGL',shares:5,cost:50})
 expect(localStorage.getItem('my_portfolio_sel_v1')).toBe('p2')
})
it('exposes saved cash, transactions and historical marks without merging books',async()=>{
 const p={...books[0],txns:[{id:'t1',d:'2026-01-02',sym:'AAPL',side:'buy',qty:10,px:100,ccy:'USD',fee:1}],snapshots:[{d:'2026-01-02',v:1500,c:'USD'}]}
 replacePortfolios([p,books[1]])
 expect((await readChatPortfolio({portfolio:'p1',section:'cash'})).balances).toEqual([{ccy:'USD',amount:500}])
 expect((await readChatPortfolio({portfolio:'p1',section:'trades'})).rows[0].id).toBe('t1')
 const history=await readChatPortfolio({portfolio:'p1',section:'history'},{fetchHistory:async()=>({marks:[]})})
 expect(history.rows[0]).toMatchObject({d:'2026-01-02',v:1500})
 expect(history.metric_definitions.drawdownPct).toContain('cash-flow-adjusted')
 expect(history.metric_definitions.high_low).toContain('raw account-value')
})
it('uses the app valuation and refuses to call a partial valuation a complete total',async()=>{
 const getQuotes=vi.fn(async syms=>syms.map(symbol=>({symbol,price:110,pct:1,currency:'USD'})))
 const result=await readChatPortfolio({portfolio:'p1',section:'summary'},{fetchQuotes:getQuotes})
 expect(result.valuation.value).toBe(1600);expect(result.valuation.unrealPnl).toBe(100)
 const missing=await readChatPortfolio({portfolio:'p1',section:'summary'},{fetchQuotes:async()=>[]})
 expect(missing.valuation.value).toBeNull();expect(missing.valuation.missing).toContain('AAPL')
})
it('returns valid paged JSON and never exposes browser credentials',async()=>{
 localStorage.setItem('alerts_v1',JSON.stringify(Array.from({length:55},(_,id)=>({id,symbol:'AAPL',type:'price',operator:'>',value:100,delivery:{destination:'private destination',token:'SECRET'}}))))
 localStorage.setItem('sync_capability','SECRET')
 const result=await readChatAppData({topic:'alerts',limit:20})
 expect(result.rows).toHaveLength(20);expect(result.next_offset).toBe(20)
 expect(JSON.stringify(result)).not.toContain('SECRET');expect(JSON.stringify(result)).not.toContain('private destination')
})
it('reports missing and ambiguous names instead of silently choosing the current book',async()=>{
 expect((await readChatPortfolio({portfolio:'missing',section:'holdings'})).error).toBeTruthy()
 expect((await readChatPortfolio({portfolio:'Long',section:'holdings'})).error).toContain('ambiguous')
})
it('registers app-visible data tools and returns complete paged JSON through the dispatcher',async()=>{
 const {TOOL_DEFS,executeTool}=await import('../../src/lib/tools.js')
 for(const name of ['get_portfolios','get_portfolio','get_app_data','get_research','get_news','read_article'])expect(TOOL_DEFS.some(t=>t.name===name)).toBe(true)
 const result=JSON.parse(await executeTool('get_portfolio',{portfolio:'p1',section:'cash'}))
 expect(result.balances).toEqual([{ccy:'USD',amount:500}])
})
