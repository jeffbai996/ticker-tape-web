import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The crumb cache is module state, so each test imports a fresh Worker.
let worker
beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-11T12:00:00Z'))
  worker = (await import('../../worker/worker.js')).default
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const quote = () => worker.fetch(new Request('https://worker.test/v7/finance/quote?symbols=AAPL'), {})

// A fake Yahoo: crumbs and quote statuses are served in order, the last repeating.
function yahoo({ crumbs = ['abc'], quotes = [200] } = {}) {
  const calls = { cookie: 0, crumb: 0, quote: [] }
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url)
    if (u.startsWith('https://fc.yahoo.com')) {
      calls.cookie++
      return new Response('', { headers: { 'set-cookie': 'A3=session; Path=/' } })
    }
    if (u.includes('/v1/test/getcrumb')) {
      const next = crumbs[Math.min(calls.crumb++, crumbs.length - 1)]
      return typeof next === 'number' ? new Response('Too Many Requests', { status: next }) : new Response(next)
    }
    calls.quote.push(new URL(u).searchParams.get('crumb'))
    const status = quotes[Math.min(calls.quote.length - 1, quotes.length - 1)]
    return new Response(JSON.stringify({ quoteResponse: { result: [] } }), { status })
  }))
  return calls
}

describe('Yahoo crumb refresh (IN-0060)', () => {
  it('does not ask Yahoo again for a crumb right after a refused refresh', async () => {
    const calls = yahoo({ crumbs: [429] })
    expect((await quote()).status).toBe(502)
    expect((await quote()).status).toBe(502)
    expect(calls.crumb).toBe(1)
    expect(calls.quote).toEqual([])
  })

  it('tries again once the backoff has passed', async () => {
    const calls = yahoo({ crumbs: [429, 'abc'] })
    expect((await quote()).status).toBe(502)
    vi.advanceTimersByTime(31 * 1000)
    expect((await quote()).status).toBe(200)
    expect(calls.crumb).toBe(2)
    expect(calls.quote).toEqual(['abc'])
  })

  it('keeps serving with the old crumb when the hourly refresh fails', async () => {
    const calls = yahoo({ crumbs: ['abc', 429] })
    expect((await quote()).status).toBe(200)
    vi.advanceTimersByTime(61 * 60 * 1000)
    expect((await quote()).status).toBe(200)
    expect(calls.quote).toEqual(['abc', 'abc'])
  })

  it('never caches an HTML page as the crumb', async () => {
    const calls = yahoo({ crumbs: ['abc', '<html>consent</html>'] })
    await quote()
    vi.advanceTimersByTime(61 * 60 * 1000)
    expect((await quote()).status).toBe(200)
    expect(calls.quote).toEqual(['abc', 'abc'])
  })

  it('drops a refused crumb, refreshes once and retries with the new one', async () => {
    const calls = yahoo({ crumbs: ['abc', 'def'], quotes: [200, 401, 200] })
    await quote()
    expect((await quote()).status).toBe(200)
    expect(calls.quote).toEqual(['abc', 'abc', 'def'])
    expect(calls.crumb).toBe(2)
  })

  it('shares one refresh among concurrent requests', async () => {
    const calls = yahoo()
    const statuses = (await Promise.all([quote(), quote(), quote(), quote(), quote()])).map(r => r.status)
    expect(statuses).toEqual([200, 200, 200, 200, 200])
    expect(calls.crumb).toBe(1)
  })
})
