import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { tavilySearch, normalizeTavily, formatResultsForPrompt, getTavilyKey, isSearchAvailable } from '../../src/chat/search.js'

describe('getTavilyKey / isSearchAvailable', () => {
  beforeEach(() => localStorage.clear())

  it('returns empty string when unset', () => {
    expect(getTavilyKey()).toBe('')
    expect(isSearchAvailable()).toBe(false)
  })

  it('reads from localStorage', () => {
    localStorage.setItem('tavily_key', 'tvly-abc')
    expect(getTavilyKey()).toBe('tvly-abc')
    expect(isSearchAvailable()).toBe(true)
  })
})

describe('normalizeTavily', () => {
  it('returns null for garbage', () => {
    expect(normalizeTavily(null)).toBeNull()
    expect(normalizeTavily('')).toBeNull()
  })

  it('normalizes results array and answer', () => {
    const out = normalizeTavily({
      query: 'NVDA earnings',
      answer: 'Beat estimates',
      results: [
        { title: 'Title A', url: 'https://a.example', content: 'Content A' },
        { title: 'Title B', url: 'https://b.example', snippet: 'Content B' },
        { url: 'https://c.example' },
      ],
    })
    expect(out.query).toBe('NVDA earnings')
    expect(out.answer).toBe('Beat estimates')
    expect(out.results).toHaveLength(3)
    expect(out.results[1].content).toBe('Content B') // falls back to snippet
    expect(out.results[2].title).toBe('') // missing title defaults to ''
  })

  it('handles missing fields gracefully', () => {
    const out = normalizeTavily({})
    expect(out.query).toBe('')
    expect(out.answer).toBeNull()
    expect(out.results).toEqual([])
  })
})

describe('formatResultsForPrompt', () => {
  it('returns empty string for null / no useful data', () => {
    expect(formatResultsForPrompt(null)).toBe('')
    expect(formatResultsForPrompt({ query: 'x', answer: null, results: [] })).toBe('')
  })

  it('emits a markdown block when there are results', () => {
    const out = formatResultsForPrompt({
      query: 'NVDA',
      answer: 'Strong quarter',
      results: [{ title: 'Headline', url: 'https://nvda.example', content: 'Body text' }],
    })
    expect(out).toContain('## Web Search Context')
    expect(out).toContain('NVDA')
    expect(out).toContain('Strong quarter')
    expect(out).toContain('https://nvda.example')
    expect(out).toContain('Body text')
  })

  it('truncates long content', () => {
    const long = 'x'.repeat(500)
    const out = formatResultsForPrompt({
      query: 'q',
      answer: null,
      results: [{ title: 't', url: 'https://u', content: long }],
    })
    expect(out).toMatch(/x{240}/)
    expect(out).not.toMatch(/x{241}/)
  })
})

describe('tavilySearch', () => {
  beforeEach(() => {
    localStorage.clear()
    globalThis.fetch = vi.fn()
  })
  afterEach(() => vi.restoreAllMocks())

  it('returns null when no key is set', async () => {
    expect(await tavilySearch('hello')).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns null for empty query', async () => {
    localStorage.setItem('tavily_key', 'tvly-abc')
    expect(await tavilySearch('')).toBeNull()
    expect(await tavilySearch('   ')).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('POSTs to api.tavily.com with the key in body', async () => {
    localStorage.setItem('tavily_key', 'tvly-abc')
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ query: 'q', answer: 'a', results: [] }),
    })
    const out = await tavilySearch('NVDA latest news')
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    const [url, opts] = globalThis.fetch.mock.calls[0]
    expect(url).toBe('https://api.tavily.com/search')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body)
    expect(body.api_key).toBe('tvly-abc')
    expect(body.query).toBe('NVDA latest news')
    expect(body.max_results).toBe(5)
    expect(body.include_answer).toBe(true)
    expect(out.query).toBe('q')
  })

  it('respects maxResults option', async () => {
    localStorage.setItem('tavily_key', 'tvly-abc')
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) })
    await tavilySearch('hello', null, { maxResults: 10 })
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.max_results).toBe(10)
  })

  it('returns null on HTTP error', async () => {
    localStorage.setItem('tavily_key', 'tvly-abc')
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 401 })
    expect(await tavilySearch('q')).toBeNull()
  })

  it('returns null on network throw', async () => {
    localStorage.setItem('tavily_key', 'tvly-abc')
    globalThis.fetch.mockRejectedValueOnce(new Error('boom'))
    expect(await tavilySearch('q')).toBeNull()
  })

  it('accepts explicit key override', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await tavilySearch('q', 'tvly-override')
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body)
    expect(body.api_key).toBe('tvly-override')
  })
})
