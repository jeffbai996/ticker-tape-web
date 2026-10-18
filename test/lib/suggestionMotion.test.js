import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {h,render} from 'preact'
import {act} from 'preact/test-utils'
import {SuggestionRows} from '../../src/components/SuggestionRows.jsx'
let root,frames,next
const items=Array.from({length:20},(_,i)=>({t:'Example suggestion '+i,k:'mkt'}))
const draw=paused=>render(h(SuggestionRows,{items,onPick:()=>{},label:a=>a.t,paused}),root)
function frame(now){const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(now)}
beforeEach(()=>{
 vi.useFakeTimers();frames=new Map();next=0
 vi.stubGlobal('requestAnimationFrame',callback=>{frames.set(++next,callback);return next})
 vi.stubGlobal('cancelAnimationFrame',id=>frames.delete(id))
 vi.spyOn(document,'hidden','get').mockReturnValue(false)
 vi.spyOn(HTMLElement.prototype,'offsetWidth','get').mockReturnValue(1000)
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(400)
 root=document.createElement('div');document.body.append(root)
})
afterEach(()=>{render(null,root);root.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers()})
it('resumes after pointer release and wheel activity settles',async()=>{
 await act(()=>draw(false));const row=root.querySelector('.chat-suggestion-row');frame(0);frame(20)
 for(const event of ['pointer','wheel']){
  const before=row.scrollLeft
  await act(()=>row.dispatchEvent(new Event(event==='pointer'?'pointerdown':'wheel',{bubbles:true})))
  frame(40);expect(row.scrollLeft).toBe(before)
  if(event==='pointer')await act(()=>window.dispatchEvent(new Event('pointerup')))
  await act(()=>vi.advanceTimersByTime(250));frame(100);frame(120)
  expect(row.scrollLeft).toBeGreaterThan(before)
 }
})
it('does not override the explicit pause control when a gesture ends',async()=>{
 await act(()=>draw(true));const row=root.querySelector('.chat-suggestion-row'),before=row.scrollLeft
 await act(()=>row.dispatchEvent(new Event('pointerdown',{bubbles:true})))
 await act(()=>window.dispatchEvent(new Event('pointerup')))
 await act(()=>vi.advanceTimersByTime(250));frame(0);frame(20)
 expect(row.scrollLeft).toBe(before)
})
