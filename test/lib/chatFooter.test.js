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
    await act(() => render(h(ChatFooter, { model:'Example', effort:'high', usage:{in:1200,out:50}, startedAt:1000, endedAt:3000 }), host))
    expect(host.textContent).toContain('1,200')
    expect(host.textContent).toContain('25.0 t/s')
    await act(() => vi.advanceTimersByTime(10000))
    expect(host.textContent).toContain('2s')
    expect(host.querySelector('[data-live]')).toBeNull()
  })
})
