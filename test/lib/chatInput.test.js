// @vitest-environment node
import {expect,it} from 'vitest'
import {submitTextKey} from '../../src/lib/chatInput.js'
it('never submits a Chinese IME confirmation key',()=>{
 expect(submitTextKey({key:'Enter',isComposing:true})).toBe(false)
 expect(submitTextKey({key:'Enter',keyCode:229})).toBe(false)
 expect(submitTextKey({key:'Enter',ctrlKey:true,isComposing:true},'modified')).toBe(false)
})
it('requires an explicit shortcut in the memory editor and preserves chat newlines',()=>{
 expect(submitTextKey({key:'Enter'},'modified')).toBe(false)
 expect(submitTextKey({key:'Enter',ctrlKey:true},'modified')).toBe(true)
 expect(submitTextKey({key:'Enter',metaKey:true},'modified')).toBe(true)
 expect(submitTextKey({key:'Enter',shiftKey:true})).toBe(false)
 expect(submitTextKey({key:'Enter'})).toBe(true)
})
