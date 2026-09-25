import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { WireAudio, sessionPageUrl, orderAudioSessions } from '../../src/components/WireAudio.jsx'

const base = 'https://wire.example.test'
const session = { id: 1, slug: 'abc123', label: 'Public event', status: 'done', starts_at: 1000 }
const waitFor = async fn => {
  for (let i = 0; i < 100; i++) {
    try { return fn() } catch (err) { if (i === 99) throw err }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
let host
afterEach(() => { if (host) render(null, host); vi.unstubAllGlobals() })

describe('embedded Fragwire audio', () => {
  it('uses session slugs, not publisher URLs or source capture URLs', () => {
    expect(sessionPageUrl(base, session)).toBe(`${base}/session/abc123`)
    for (const slug of ['../../api/arm', 'https://other.test', '<script>', '']) {
      expect(sessionPageUrl(base, { slug })).toBe('')
    }
  })
  it('puts active captures first, then newest recordings without mutating the source', () => {
    const rows = [session, { ...session, id: 2, starts_at: 2000 }, { ...session, id: 3, status: 'capturing' }]
    expect(orderAudioSessions(rows).map(s => s.id)).toEqual([3, 2, 1])
    expect(rows.map(s => s.id)).toEqual([1, 2, 3])
  })
  it('opens the full existing session player, preserving reports and transcript behavior', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ sessions: [session] }) })
    vi.stubGlobal('fetch', fetcher)
    host = document.createElement('div')
    render(h(WireAudio, { endpoint: base }), host)
    await waitFor(() => expect(host.querySelector('[data-audio-session]')).not.toBeNull())
    host.querySelector('[data-audio-session]').click()
    await waitFor(() => expect(host.querySelector('iframe')?.getAttribute('src')).toBe(`${base}/session/abc123`))
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(host.textContent).toContain('Open separately')
  })
  it('shows an actionable error when the catalog fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Error('offline')))
    host = document.createElement('div')
    render(h(WireAudio, { endpoint: base }), host)
    await waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain('Retry'))
    expect(host.querySelector('iframe')).toBeNull()
  })
})
