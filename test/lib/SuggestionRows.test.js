import {afterEach,expect,it,vi} from 'vitest'
import {h,render} from 'preact'
import {act} from 'preact/test-utils'
import {SuggestionRows} from '../../src/components/SuggestionRows.jsx'
let root
const items=Array.from({length:24},(_,i)=>({t:`Question ${i}`,k:i%2?'macro':'book'}))
afterEach(()=>{if(root){render(null,root);root.remove()}vi.unstubAllGlobals();vi.restoreAllMocks()})
it('moves adjacent rows in opposite directions and pauses for reading and reduced motion',async()=>{
 const frames=new Map();let id=0;const mediaChanges=[]
 vi.stubGlobal('requestAnimationFrame',f=>{frames.set(++id,f);return id})
 vi.stubGlobal('cancelAnimationFrame',n=>frames.delete(n))
 vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}})
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:(_,f)=>{mediaChanges.push(f)},removeEventListener(){}}))
 vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockReturnValue(300)
 vi.spyOn(HTMLElement.prototype,'offsetWidth','get').mockReturnValue(900)
 root=document.createElement('div');document.body.append(root)
 await act(()=>render(h(SuggestionRows,{items,onPick:()=>{},label:a=>a.t}),root))
 const rows=[...root.querySelectorAll('.chat-suggestion-row')]
 const advance=t=>{const pending=[...frames.values()];frames.clear();pending.forEach(f=>f(t))}
 advance(0);const before=rows.map(r=>r.scrollLeft);advance(100)
 expect(rows[0].scrollLeft).toBeGreaterThan(before[0]);expect(rows[1].scrollLeft).toBeLessThan(before[1])
 rows[0].dispatchEvent(new MouseEvent('mouseenter'));const held=rows[0].scrollLeft;advance(200)
 expect(rows[0].scrollLeft).toBe(held)
 rows[0].dispatchEvent(new MouseEvent('mouseleave'));advance(300);advance(400)
 expect(rows[0].scrollLeft).not.toBe(held)
 mediaChanges.forEach(f=>f({matches:true}));const still=rows.map(r=>r.scrollLeft);advance(500)
 expect(rows.map(r=>r.scrollLeft)).toEqual(still)
})
it('keeps duplicate loop copies out of keyboard navigation and sends the original prompt',async()=>{
 const onPick=vi.fn();root=document.createElement('div');document.body.append(root)
 await act(()=>render(h(SuggestionRows,{items,onPick,label:a=>`Label ${a.t}`}),root))
 const copies=root.querySelectorAll('[aria-hidden="true"] button')
 expect(copies.length).toBe(items.length);expect([...copies].every(b=>b.tabIndex===-1)).toBe(true)
 await act(()=>root.querySelector('button').click())
 expect(onPick).toHaveBeenCalledWith('Question 0')
})
