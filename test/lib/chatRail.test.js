// @vitest-environment node
import {expect,it} from 'vitest'
import {chatRailData} from '../../src/lib/chatRail.js'
it('shows more useful live rows without inventing missing quotes or earnings',()=>{
 const symbols=Array.from({length:16},(_,i)=>'S'+i)
 const quotes=Object.fromEntries(symbols.map((s,i)=>[s,{quote:{pct:i-8},tech:{rsi:i===0?20:50,volRatio:i===1?3:1}}]))
 const earnDays=Object.fromEntries(symbols.map((s,i)=>[s,i]))
 const data=chatRailData({symbols:[...symbols,'S0','MISSING'],quotes,earnDays,events:Array.from({length:10},(_,i)=>({date:'2026-01-02',label:'event'+i}))})
 expect(data.movers).toHaveLength(8);expect(data.movers[0].sym).toBe('S0')
 expect(data.earnings).toHaveLength(10);expect(data.earnings[0]).toMatchObject({symbol:'S0',days:0})
 expect(data.signals.map(s=>s.symbol).sort()).toEqual(['S0','S1'])
 expect(data.events).toHaveLength(6)
 expect(data.movers.some(m=>m.sym==='MISSING')).toBe(false)
})
