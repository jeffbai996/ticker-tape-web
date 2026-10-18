// @vitest-environment node
import {expect,it} from 'vitest'
import {briefingSources,resolveBriefingSource,briefingSourceText} from '../../src/lib/briefingSource.js'
const lists=[{id:'other',name:'Other list',symbols:['MSFT','MSFT']}]
const portfolios=[{id:'p1',name:'Example portfolio',ccy:'USD',holdings:[{symbol:'GOOGL',shares:7,cost:80}],cash:[{ccy:'USD',amount:500}]}]
const options={watchlist:['AAPL'],lists,portfolios,held:['GOOGL'],tape:['AAPL','MSFT']}
it('reads an independent saved source without changing the supplied lists or active book',()=>{
 const before=JSON.stringify(options)
 expect(briefingSources(options).map(s=>s.id)).toEqual(['current','watchlist:other','portfolio:p1'])
 const list=resolveBriefingSource('watchlist:other',options)
 expect(list.symbols).toEqual(['MSFT']);expect(list.held).toEqual([]);expect(list.techUniverse).toEqual(['MSFT'])
 const book=resolveBriefingSource('portfolio:p1',options)
 expect(book.symbols).toEqual(['GOOGL']);expect(book.held).toEqual(['GOOGL'])
 expect(briefingSourceText(book)).toContain('"shares":7')
 expect(briefingSourceText(book)).toContain('"amount":500')
 expect(JSON.stringify(options)).toBe(before)
})
it('falls back to the current watchlist if a saved source disappears',()=>{
 const source=resolveBriefingSource('portfolio:missing',options)
 expect(source.id).toBe('current');expect(source.symbols).toEqual(['AAPL'])
 expect(source.held).toEqual(['GOOGL']);expect(source.techUniverse).toEqual(['AAPL','MSFT'])
})
