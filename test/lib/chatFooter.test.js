import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { ChatFooter } from '../../src/components/ChatFooter.jsx'

let host
afterEach(() => { if (host) { render(null, host); host.remove() } vi.useRealTimers() })
describe('live chat footer', () => {
  it('updates elapsed time, accepts usage and freezes when the response finishes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(1000)
    host = document.createElement('div'); document.body.append(host)
    await act(() => render(h(ChatFooter, { model:'Example', effort:'high', startedAt:1000, busy:true }), host))
    expect(host.textContent).toContain('—')
    await act(() => vi.advanceTimersByTime(2000))
    expect(host.textContent).toContain('2s')
    await act(() => render(h(ChatFooter, { model:'Example', effort:'high', usage:{in:1200,out:50,decode_tokens:50,decode_seconds:1}, startedAt:1000, endedAt:3000 }), host))
    expect(host.textContent).toContain('1,200')
    expect(host.textContent).toContain('50.0 tok/s')
    await act(() => vi.advanceTimersByTime(10000))
    expect(host.textContent).toContain('2s')
    expect(host.querySelector('[data-live]')).toBeNull()
  })
})

it.each([
 ['Claude Sonnet 5.5','Claude','claude'],
 ['Gemini 4 Argon','Gemini','gemini'],
 ['Qwen 3.8','Qwen','qwen'],
 ['Example model','Example model',undefined],
])('labels %s by its provider in both footer layouts and keeps the full name on hover',async(model,label,provider)=>{
 host=document.createElement('div');document.body.append(host)
 await act(()=>render(h(ChatFooter,{model,effort:'low'}),host))
 expect(host.querySelector('.chat-token-model').title).toContain(model)
 expect(host.querySelector('.chat-model-short').textContent).toBe(label)
 expect(host.querySelector('.chat-model-full').textContent).toBe(label)
 expect(host.querySelector('.chat-token-provider')?.dataset.provider).toBe(provider)
})
