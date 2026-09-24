import { describe, it, expect, vi } from 'vitest'
import { publicArticleUrl, extractArticle, handleReader, ReaderQuota } from '../../worker/reader.js'

describe('bounded family reader', () => {
  it('enforces a shared minute limit with durable counters', async () => {
    let saved
    const storage = { get: async () => saved, put: async (_, value) => { saved = value } }
    const quota = new ReaderQuota({ storage: { transaction: fn => fn(storage) } })
    const clock = vi.spyOn(Date, 'now').mockReturnValue(60000)
    try {
      for (let i = 0; i < 20; i++) expect((await quota.fetch()).status).toBe(204)
      expect((await quota.fetch()).status).toBe(429)
      clock.mockReturnValue(120000)
      expect((await quota.fetch()).status).toBe(204)
      saved.d = 500
      expect((await quota.fetch()).status).toBe(429)
      clock.mockReturnValue(86400000)
      expect((await quota.fetch()).status).toBe(204)
    } finally { clock.mockRestore() }
  })
  it('only permits known HTTPS publishers, not arbitrary URLs', () => {
    expect(publicArticleUrl('https://news.rthk.hk/story')).toBeTruthy()
    for (const url of ['http://www.reuters.com/a', 'https://reuters.com.evil.test/', 'https://127.0.0.1/', 'https://reuters.com:8080/a', 'https://me:secret@reuters.com/a', 'https://private.example.test/']) expect(publicArticleUrl(url)).toBeNull()
  })
  it('extracts article paragraphs without navigation or scripts', () => {
    const result = extractArticle('<article><nav><p>Navigation content not wanted here</p></nav><p>The company reported revenue of 20 million dollars.</p><p>Guidance for next year was raised by ten percent.</p><script>alert(1)</script></article>')
    expect(result.text).toContain('revenue')
    expect(result.text).not.toMatch(/Navigation|alert/)
    expect(result.truncated).toBe(true)
  })
  it('can use structured article text', () => {
    expect(extractArticle('<script type="application/ld+json">{"@type":"NewsArticle","articleBody":"Full published article text"}</script>').text).toBe('Full published article text')
  })
  const request = (suffix = 'id=7') => new Request(`https://edge.test/wire/api/read?${suffix}`, { headers: { Authorization: 'Bearer fixture-reader' } })
  const env = () => ({ WIRE_READER_TOKEN: 'fixture-reader', SPEND: { get: vi.fn(async key => key === 'wire:public' ? { events: [{ id: 7, url: 'https://news.rthk.hk/a' }] } : null), put: vi.fn() }, READER_QUOTA: { idFromName: n => n, get: () => ({ fetch: async () => new Response(null, { status: 204 }) }) } })
  it('rejects missing credentials and arbitrary URL parameters before fetch', async () => {
    const fetcher = vi.fn()
    expect((await handleReader(new Request('https://edge.test/wire/api/read?id=7'), env(), fetcher)).status).toBe(401)
    expect((await handleReader(request('id=7&url=https://evil.test'), env(), fetcher)).status).toBe(400)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('only fetches retained feed IDs and blocks redirected private hosts', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } }))
    expect((await handleReader(request('id=8'), env(), fetcher)).status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
    expect((await handleReader(request(), env(), fetcher)).status).toBe(502)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('fetches and caches only extracted text', async () => {
    const store = env()
    const fetcher = vi.fn(async () => new Response('<article><p>Published public article with enough text to form a paragraph.</p></article>', { headers: { 'content-type': 'text/html' } }))
    const out = await (await handleReader(request(), store, fetcher)).json()
    expect(out.text).toContain('Published public article')
    expect(out.text).not.toContain('<')
    expect(store.SPEND.put).toHaveBeenCalledOnce()
  })
  it('fails closed when the quota is exhausted', async () => {
    const store = env()
    store.READER_QUOTA.get = () => ({ fetch: async () => new Response(null, { status: 429 }) })
    expect((await handleReader(request(), store)).status).toBe(429)
    expect(store.SPEND.get).not.toHaveBeenCalled()
  })
})
