import {afterEach,expect,it,vi} from 'vitest'
vi.mock('../../src/lib/wire.js',()=>({wireServiceUrl:()=>'https://fixture.invalid'}))
vi.mock('../../src/lib/nav.js',()=>({IS_FAMILY_AI:false}))
import {fetchBooksJson} from '../../src/lib/chatContext.js'

afterEach(()=>vi.unstubAllGlobals())

it('names the wire book, whose portfolio response has no name',async()=>{
 const wire={ok:true,account:'all',account_label:'Both',positions:[{symbol:'AAPL',shares:10,avg_cost:100}]}
 vi.stubGlobal('fetch',vi.fn(async()=>({json:async()=>wire})))
 const [book]=await fetchBooksJson()
 expect(book.name).toBe('IBKR')
 expect(book.positions).toEqual(wire.positions)
})
