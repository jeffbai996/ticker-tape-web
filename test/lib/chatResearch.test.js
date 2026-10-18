import {expect,it,vi} from 'vitest'
const providers=vi.hoisted(()=>({history:vi.fn(async()=>({bars:Array.from({length:60},(_,time)=>({time,close:100+time}))})),article:vi.fn(async()=>({ok:true,text:'a'.repeat(13000)}))}))
vi.mock('../../src/lib/history.js',()=>({fetchHistory:providers.history,fetchDividends:vi.fn(async()=>[])}))
vi.mock('../../src/lib/portfolioNews.js',()=>({loadPortfolioWire:vi.fn(async()=>[{id:123,url:'https://example.com/article',headline:'Company report',type:'headline',ts_event:100}]),loadCompanyNews:vi.fn(async()=>({events:[]})),portfolioStories:vi.fn(()=>[])}))
vi.mock('../../src/lib/wire.js',()=>({wireUrl:()=>'',fetchWireArticle:providers.article,pubDisplayName:()=> 'Publisher',matchesWireQuery:()=>true}))
vi.mock('../../src/lib/zhNames.js',()=>({zhName:()=>'',loadZhTable:async()=>{}}))
import {readChatResearch,readChatNews,readChatArticle} from '../../src/lib/chatResearch.js'
it('pages price history in newest-first order and validates symbols before fetching',async()=>{
 const page=await readChatResearch({symbol:'AAPL',section:'history',limit:10})
 expect(page.rows[0].time).toBe(59);expect(page.next_offset).toBe(10)
 const calls=providers.history.mock.calls.length
 expect((await readChatResearch({symbol:'https://example.com',section:'history'})).error).toBeTruthy()
 expect(providers.history).toHaveBeenCalledTimes(calls)
})
it('reads only articles returned by the feed and chunks long text without losing it',async()=>{
 const news=await readChatNews({})
 expect(news.rows[0].id).toBe('123')
 const first=await readChatArticle({id:'123'})
 const second=await readChatArticle({id:'123',offset:first.next_offset})
 expect(first.text.length).toBe(6000);expect(second.next_offset).toBe(12000)
 const count=providers.article.mock.calls.length
 expect((await readChatArticle({id:'https://example.com/arbitrary'})).error).toContain('not found')
 expect(providers.article).toHaveBeenCalledTimes(count)
})
