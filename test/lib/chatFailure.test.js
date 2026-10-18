import {afterEach,expect,it,vi} from 'vitest'
import {h,render} from 'preact'
import {act} from 'preact/test-utils'
import {ChatFailure} from '../../src/components/ChatFailure.jsx'
let root
afterEach(()=>{if(root){render(null,root);root.remove()}vi.useRealTimers()})
it('shows the retry wait and enables retry when the cooldown expires',async()=>{
 vi.useFakeTimers();vi.setSystemTime(1000);const retry=vi.fn();root=document.createElement('div')
 await act(()=>render(h(ChatFailure,{error:{message:'limit',status:429,code:'rate_limited',retryAt:3000},onRetry:retry}),root))
 expect(root.querySelector('button').disabled).toBe(true)
 await act(()=>vi.advanceTimersByTime(2000))
 expect(root.querySelector('button').disabled).toBe(false)
 await act(()=>root.querySelector('button').click());expect(retry).toHaveBeenCalledOnce()
})
