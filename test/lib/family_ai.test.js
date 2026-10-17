import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); localStorage.clear() })

async function family(enabled = true, build = true) {
  vi.stubEnv('VITE_PRIVATE', '')
  vi.stubEnv('VITE_FAMILY_BUILD', build ? '1' : '')
  vi.stubEnv('VITE_FAMILY_AI', enabled ? '1' : '')
  vi.stubEnv('VITE_SYNC_CAPABILITY', 'a'.repeat(32))
  vi.stubEnv('VITE_DATA_PROXY', 'https://proxy.example.test')
  return import('../../src/lib/wirechat.js')
}

it('uses only the family transport and pins Sonnet Medium', async () => {
  const chat = await family()
  const fetcher = vi.fn(async () => Response.json({ ok: true, text: 'Summary' }))
  vi.stubGlobal('fetch', fetcher)
  expect(chat.wireChatAvailable()).toBe(true)
  await chat.wireComplete({ model: 'other', effort: 'high', messages: [{ role: 'user', content: 'Hello' }] })
  const [url, options] = fetcher.mock.calls[0]
  expect(url).toBe('https://proxy.example.test/family-ai/api/chat')
  expect(options.headers.Authorization).toBe(`Bearer ${'a'.repeat(32)}`)
  expect(JSON.parse(options.body)).toMatchObject({ model: 'family-sonnet', effort: 'medium' })
  expect((await import('../../src/lib/wire.js')).wireServiceUrl()).toBe('')
})

it('keeps family inference off until explicitly enabled', async () => {
  const chat = await family(false)
  expect(chat.wireChatAvailable()).toBe(false)
  const { NAV } = await import('../../src/lib/nav.js')
  expect(NAV.find(s => s.id === 'chat').badge).toBe('DEMO')
  expect(NAV.some(s => s.id === 'brief')).toBe(false)
})

it('activates family chat without a preview badge', async () => {
  await family()
  const { NAV } = await import('../../src/lib/nav.js')
  expect(NAV.find(s => s.id === 'chat').badge).toBeUndefined()
})

it('never enables inference in the public build', async () => {
  await family(true, false)
  const chat = await import('../../src/lib/wirechat.js')
  expect(chat.wireChatAvailable()).toBe(false)
})

it('keeps an unconfigured family build on the preview', async () => {
  vi.stubEnv('VITE_FAMILY_BUILD', '1')
  vi.stubEnv('VITE_FAMILY_AI', '1')
  vi.stubEnv('VITE_SYNC_CAPABILITY', '')
  const { IS_FAMILY_AI } = await import('../../src/lib/nav.js')
  expect(IS_FAMILY_AI).toBe(false)
})

it('generates a family report through the subscription transport', async () => {
  await family()
  const fetcher = vi.fn(async url => String(url).endsWith('/models')
    ? Response.json({ ok: true, models: [{ key: 'family-sonnet', label: 'Sonnet 5.5', fixed_effort: 'medium' }] })
    : new Response('event: delta\ndata: {"t":"text","d":"Report ready."}\n\nevent: done\ndata: {}\n\n', { headers: { 'Content-Type': 'text/event-stream' } }))
  vi.stubGlobal('fetch', fetcher)
  Element.prototype.scrollTo ||= () => {}
  const { h, render } = await import('preact')
  const { act } = await import('preact/test-utils')
  const { AiReport } = await import('../../src/components/AiReport.jsx')
  const root = document.createElement('div')
  document.body.append(root)
  try {
    await act(async () => render(h(AiReport, { buildPrompt: async () => ({ system: 'Research', prompt: 'Summarize supplied data.' }) }), root))
    const generate = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === 'generate')
    expect(generate.disabled).toBe(false)
    await act(async () => generate.click())
    await vi.waitFor(() => expect(root.textContent).toContain('Report ready.'))
    expect(fetcher.mock.calls.every(([url]) => String(url).startsWith('https://proxy.example.test/family-ai/'))).toBe(true)
  } finally {
    await act(async () => render(null, root))
    root.remove()
  }
})

it('uses the family transport for memory edits from the full chat UI', async () => {
  await family()
  const fetcher = vi.fn(async () => Response.json({ ok: true, text: '[{"op":"add","text":"Prefers concise summaries."}]' }))
  vi.stubGlobal('fetch', fetcher)
  const { h, render } = await import('preact')
  const { act } = await import('preact/test-utils')
  const { MemoryComposer } = await import('../../src/pages/chat.jsx')
  const root = document.createElement('div')
  document.body.append(root)
  try {
    await act(async () => render(h(MemoryComposer, { memories: [], onApplied: () => {} }), root))
    const input = root.querySelector('textarea,input')
    await act(async () => { input.value = 'Remember concise summaries'; input.dispatchEvent(new Event('input', { bubbles: true })) })
    await act(async () => root.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://proxy.example.test/family-ai/api/chat')
    expect(options.headers.Authorization).toBe(`Bearer ${'a'.repeat(32)}`)
  } finally { await act(async () => render(null, root)); root.remove() }
})
