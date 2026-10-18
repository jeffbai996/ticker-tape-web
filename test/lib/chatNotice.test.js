import {expect,it,vi,afterEach} from 'vitest'
import {h,render} from 'preact'
import {act} from 'preact/test-utils'
import {ChatNotice} from '../../src/components/ChatNotice.jsx'
import {applyMemoryTags} from '../../src/lib/chatMemory.js'
let root
afterEach(()=>{if(root){render(null,root);root.remove()}localStorage.clear()})
it('shows a localized memory action that opens its panel without internal IDs',async()=>{
 localStorage.setItem('locale_v1','en')
 const open=vi.fn();root=document.createElement('div')
 await act(()=>render(h(ChatNotice,{notice:{kind:'memory',items:[{action:'saved',id:2}]},onMemory:open}),root))
 const button=root.querySelector('button')
 expect(button.textContent).toBe('Memory saved')
 expect(button.textContent).not.toContain('#2')
 button.click();expect(open).toHaveBeenCalledOnce()
})
it('returns structured confirmation events while stripping saved tags',()=>{
 const out=applyMemoryTags('Saved. [MEMORY: Generic preference]')
 expect(out.text).toBe('Saved.')
 expect(out.notes).toEqual([{action:'saved',id:expect.any(Number)}])
})
