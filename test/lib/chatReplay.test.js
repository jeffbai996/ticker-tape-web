// @vitest-environment node
import {expect,it} from 'vitest'
import {replayRequest} from '../../src/lib/chatReplay.js'
it('branches before the edited user turn and leaves the original intact',()=>{
 const history=[{role:'user',content:'first'},{role:'assistant',content:'answer'},{role:'user',content:'old',context:{symbol:'AAPL'},failure:'failed'},{role:'assistant',content:'partial'}]
 const original=JSON.stringify(history)
 const branch=replayRequest(history,2,' revised ',{model:'new',effort:'medium'},100)
 expect(branch.prefix).toEqual(history.slice(0,2))
 expect(branch.request).toEqual({text:'revised',context:{symbol:'AAPL'},model:'new',effort:'medium',ts:100})
 expect(JSON.stringify(history)).toBe(original)
 expect(()=>replayRequest(history,1,'wrong',{})).toThrow()
 expect(()=>replayRequest(history,2,' ',{})).toThrow()
})
