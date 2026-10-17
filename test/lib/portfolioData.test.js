import {expect,it} from 'vitest'
import {mergeHistory,portfolioDataTimes} from '../../src/lib/portfolioData.js'
it('prefers collected marks without inventing missing days or losing legacy values',()=>{
 const legacy=[{d:'2026-01-01',v:100,c:'USD'},{d:'2026-01-02',v:101,c:'USD'}]
 const remote=[{d:'2026-01-02',v:102,c:'USD',source:'collector',cash:'25'},{d:'2026-01-04',v:105,c:'USD'}]
 const out=mergeHistory(legacy,remote)
 expect(out.map(p=>p.v)).toEqual([100,102,105]);expect(out[1].cash).toBe('25')
 expect(legacy[1].v).toBe(101)
})
it('reports the oldest actual price and FX times separately from receipt clocks',()=>{
 const out=portfolioDataTimes([{symbol:'AAPL'},{symbol:'MSFT'}],{AAPL:{marketTime:100},MSFT:{marketTime:90,extPrice:10,extMarketTime:110}},['USD','CAD'],'USD',{'CADUSD=X':{snapshotTs:99999,quote:{marketTime:50}}})
 expect(out).toEqual({price:100,missing:0,fx:50,fxMissing:0,fxNeeded:true})
 const missing=portfolioDataTimes([{symbol:'AAPL'}],{},['USD'],'USD',{})
 expect(missing.missing).toBe(1);expect(missing.price).toBeNull();expect(missing.fxNeeded).toBe(false)
})
