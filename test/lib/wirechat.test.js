import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWireChatModels, wireComplete } from '../../src/lib/wirechat.js'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('wire chat model selection', () => {
  it('loads the model registry from fragwire', async () => {
    localStorage.setItem('tape-wire-url', 'https://wire.example')
    const models = [{ key: 'auto', label: 'Auto' }, { key: 'claude', label: 'Claude Sonnet' }]
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, models }),
    })
    vi.stubGlobal('fetch', fetch)

    await expect(fetchWireChatModels()).resolves.toEqual(models)
    expect(fetch).toHaveBeenCalledWith(
      'https://wire.example/api/chat/models',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it('sends the chosen model with every completion', async () => {
    localStorage.setItem('tape-wire-url', 'https://wire.example')
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, text: 'hello', backend: 'claude' }),
    })
    vi.stubGlobal('fetch', fetch)

    await wireComplete({
      model: 'claude',
      system: 'system',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      model: 'claude',
      system: 'system',
      messages: [{ role: 'user', content: 'hi' }],
    })
  })
})
