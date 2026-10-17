// @vitest-environment node
import { expect, it } from 'vitest'
import { dailyMovers, upcomingPortfolioDates } from '../../src/lib/portfolioOverview.js'
it('ranks actual monetary contributions and excludes cash and missing values',()=>{
 const rows=[{symbol:'AAPL',valueDisplay:100,dayPnlDisplay:5,dayPct:2},{symbol:'MSFT',valueDisplay:100,dayPnlDisplay:-8,dayPct:-3},
 {symbol:'CASH',kind:'cash',valueDisplay:100,dayPnlDisplay:20},{symbol:'GOOGL',valueDisplay:null,dayPnlDisplay:100}]
 expect(dailyMovers(rows).map(r=>r.symbol)).toEqual(['MSFT','AAPL'])
})
it('shows only announced future dates for the current holdings without inventing payments',()=>{
 const out=upcomingPortfolioDates([{symbol:'AAPL'},{symbol:'MSFT'}],{AAPL:{nextResults:'2026-01-20',exDate:'2026-01-01',payDate:'2026-01-25'},MSFT:{nextResults:'2026-05-01'},GOOGL:{nextResults:'2026-01-21'}},'2026-01-15')
 expect(out.map(x=>[x.symbol,x.kind,x.date])).toEqual([['AAPL','results','2026-01-20'],['AAPL','payment','2026-01-25']])
})
