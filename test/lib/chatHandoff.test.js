import { afterEach, expect, it } from 'vitest'
import { stageChatQuestion, takeChatContext, contextualMessages, takeChatAction, contextualReadTools } from '../../src/lib/chatHandoff.js'
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

it('consumes one-click intent once and never carries it into an editable handoff',()=>{
  stageChatQuestion('Explain Example portfolio',{label:'Example portfolio',data:{portfolio_id:'book-2'}},{submit:true})
  expect(takeChatAction()).toEqual({question:'Explain Example portfolio'})
  expect(takeChatAction()).toBeNull()
  stageChatQuestion('Old action',null,{submit:true})
  expect(takeChatAction('A different question')).toBeNull()
  stageChatQuestion('One click',null,{submit:true})
  stageChatQuestion('Editable',null)
  expect(takeChatAction()).toBeNull()
})
it('reads the explicitly selected book before answering instead of relying on the default book',()=>{
  expect(contextualReadTools({label:'Example',data:{portfolio_id:'book-2',portfolio:'Example portfolio'}})).toEqual([{name:'get_portfolio',args:{portfolio:'book-2',section:'holdings'}}])
  expect(contextualReadTools({label:'Example',data:{kind:'watchlist'}})).toEqual([])
  expect(contextualReadTools({label:'Broker',data:{portfolio_id:'broker'}})).toEqual([])
})

it('draws the view an entry point asked for, from an allowlist, and never for a broker book',()=>{
  const book={label:'Example',data:{portfolio_id:'book-2',visual:'contributors'}}
  expect(contextualReadTools(book)).toEqual([
    {name:'get_portfolio',args:{portfolio:'book-2',section:'holdings'}},
    {name:'chart_portfolio',args:{portfolio:'book-2',view:'contributors'}},
  ])
  expect(contextualReadTools({label:'Example',data:{portfolio_id:'book-2',visual:'delete_everything'}})).toEqual([{name:'get_portfolio',args:{portfolio:'book-2',section:'holdings'}}])
  expect(contextualReadTools({label:'Broker',data:{portfolio_id:'broker',visual:'allocation'}})).toEqual([])
  expect(contextualReadTools({label:'AAPL',data:{kind:'research',symbol:'aapl',visual:'price'}})).toEqual([{name:'chart_price',args:{symbol:'AAPL',range:'6M'}}])
  expect(contextualReadTools({label:'AAPL',data:{kind:'research',symbol:'../etc',visual:'price'}})).toEqual([])
  expect(contextualReadTools({label:'List',data:{kind:'watchlist',symbols:['AAPL','msft','bad symbol','GOOGL'],visual:'compare'}})).toEqual([{name:'chart_compare',args:{symbols:['AAPL','MSFT','GOOGL'],range:'3M'}}])
  expect(contextualReadTools({label:'List',data:{kind:'watchlist',symbols:['AAPL'],visual:'compare'}})).toEqual([])
  expect(contextualReadTools({label:'List',data:{kind:'watchlist',symbols:['AAPL','MSFT','GOOGL'],movers:[{symbol:'TSLA',pct:9},{symbol:'AMZN',pct:-4},{symbol:'TSLA'}],visual:'compare'}})).toEqual([{name:'chart_compare',args:{symbols:['TSLA','AMZN'],range:'3M'}}])
})
it('keeps a visual block off the model boundary',()=>{
  const out=contextualMessages([{role:'tool',id:'w0',name:'chart_compare',content:'{}',block:{v:1}},{role:'assistant',content:'Done'}])
  expect(out[0]).toEqual({role:'tool',id:'w0',name:'chart_compare',content:'{}'})
})
