import { expect, it } from 'vitest'
import { manualBookSnapshot, manualBookSnapshots, manualPortfolioContext } from '../../src/lib/manualChatBook.js'
const books=[{id:'p1',name:'US portfolio',ccy:'USD',holdings:[{symbol:'AAPL',shares:10,cost:100}]},
  {id:'p2',name:'Second portfolio',ccy:'USD',holdings:[{symbol:'MSFT',shares:20,cost:200}]}]
it('uses the selected saved portfolio without mixing positions across books',()=>{
  const snapshot=manualBookSnapshot(books,'p2')
  expect(snapshot).toMatchObject({manual:true,name:'Second portfolio',positions:[{symbol:'MSFT',shares:20,avg_cost:200}]})
  expect(snapshot.margin).toBeUndefined()
  expect(snapshot.positions[0].weight_pct).toBeUndefined()
  const context=manualPortfolioContext(snapshot)
  expect(context).toContain('MSFT')
  expect(context).not.toContain('AAPL')
  expect(context).toContain('not broker-synced')
})
it('returns no book for an empty saved portfolio list',()=>{
  expect(manualBookSnapshot([])).toBeNull()
})
it('uses the first existing book when a previously selected book was removed',()=>{
  expect(manualBookSnapshot(books,'missing').id).toBe('p1')
})
it('lists every saved portfolio that has holdings, marking the selected one',()=>{
  const all=manualBookSnapshots([...books,{id:'p3',name:'Empty',ccy:'USD',holdings:[]}],'p2')
  expect(all.map(b=>[b.id,b.selected])).toEqual([['p1',false],['p2',true]])
  expect(all[0].positions.map(p=>p.symbol)).toEqual(['AAPL'])
})
