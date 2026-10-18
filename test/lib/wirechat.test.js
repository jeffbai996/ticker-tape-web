import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWireChatModels, wireComplete } from '../../src/lib/wirechat.js'

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
})

describe('wire chat model selection', () => {
  it('loads the model registry from newsservice', async () => {
    localStorage.setItem('tape-wire-url', 'https://wire.example')
    const models = [
      { key: 'auto', label: 'Auto' },
      { key: 'gpt-terra', label: 'GPT 5.6 Terra', efforts: ['low', 'medium', 'high', 'xhigh'] },
    ]
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
      effort: 'high',
      system: 'system',
      messages: [{ role: 'user', content: 'hi' }],
    })

    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      model: 'claude',
      effort: 'high',
      system: 'system',
      messages: [{ role: 'user', content: 'hi' }],
    })
  })
})

it('marks a stream that failed after visible output as partial',async()=>{
 const {wireStream}=await import('../../src/lib/wirechat.js')
 localStorage.setItem('tape-wire-url','https://wire.example')
 const frames='event: delta\ndata: {"t":"text","d":"partial"}\n\nevent: error\ndata: {"error":"interrupted"}\n\n'
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(frames,{status:200})))
 await expect(wireStream({model:'qwen-local',messages:[{role:'user',content:'hello'}]})).rejects.toMatchObject({partial:true,message:'interrupted'})
})
