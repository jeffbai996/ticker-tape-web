import { afterEach, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { Palette } from '../../src/components/Palette.jsx'
import { setLocale } from '../../src/lib/i18n.js'
vi.mock('../../src/lib/search.js', async original => ({...(await original()), searchSymbols: async()=>[]}))
let root
afterEach(()=>{if(root){render(null,root);root.remove()}setLocale('en')})
it('selects a localized destination with the keyboard without moving focus',async()=>{
 setLocale('zh');root=document.createElement('div');document.body.append(root)
 const close=vi.fn();await act(()=>render(h(Palette,{onClose:close,seed:'市场'}),root))
 const input=root.querySelector('input')
 expect(root.textContent).toContain('市场')
 input.focus();await act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})))
 expect(document.activeElement).toBe(input)
 await act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})))
 expect(close).not.toHaveBeenCalled()
 await act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})))
 expect(location.hash).toBe('#/markets');expect(close).toHaveBeenCalledOnce()
})
