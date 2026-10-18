import {afterEach,expect,it,vi} from 'vitest'
import {h,render} from 'preact'
import {act} from 'preact/test-utils'
import {ConversationDelete} from '../../src/components/ConversationDelete.jsx'
let root
afterEach(()=>{if(root){render(null,root);root.remove()}vi.useRealTimers()})
it('requires a second click on the icon-only confirmation before deleting',async()=>{
 const remove=vi.fn();root=document.createElement('div')
 await act(()=>render(h(ConversationDelete,{onDelete:remove}),root))
 await act(()=>root.querySelector('button').click())
 expect(remove).not.toHaveBeenCalled()
 const confirm=root.querySelector('[data-confirm-delete]')
 expect(confirm.textContent.trim()).toBe('');expect(confirm.querySelector('svg')).not.toBeNull()
 await act(()=>confirm.click());expect(remove).toHaveBeenCalledOnce()
})
it('lets Escape cancel without deleting',async()=>{
 const remove=vi.fn();root=document.createElement('div')
 await act(()=>render(h(ConversationDelete,{onDelete:remove}),root))
 await act(()=>root.querySelector('button').click())
 await act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})))
 expect(root.querySelector('[data-confirm-delete]')).toBeNull();expect(remove).not.toHaveBeenCalled()
})
