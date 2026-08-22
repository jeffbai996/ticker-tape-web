import { cnF10Upstream, cnSecurity } from '../../worker/worker.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { allowedYahooGetPath } from '../../worker/worker.js'

afterEach(() => vi.unstubAllGlobals())

describe('public Worker route boundaries', () => {
  it('has no reachable AI route or provider call', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    for (const path of ['/chat', '/chat/models', '/chat/spend']) {
      const response = await worker.fetch(new Request(`https://worker.test${path}`, {
        method: path === '/chat' ? 'POST' : 'GET',
        body: path === '/chat' ? '{}' : undefined,
      }), {})
      expect(response.status).toBe(404)
    }
    expect(upstream).not.toHaveBeenCalled()
  })

  it('dispatches only bearer-authenticated family document routes', async () => {
    const env = {}
    expect((await worker.fetch(new Request('https://worker.test/watchlists'), env)).status).toBe(401)
    expect((await worker.fetch(new Request('https://worker.test/portfolios'), env)).status).toBe(401)
    expect((await worker.fetch(new Request(`https://worker.test/watchlists/${'0'.repeat(32)}`), env)).status).toBe(404)
  })

  it('allows only the market-data routes the client actually uses', () => {
    for (const path of [
      '/v1/finance/search', '/v7/finance/quote', '/v7/finance/options/AAPL',
      '/v8/finance/chart/%5EGSPC', '/v10/finance/quoteSummary/0700.HK',
      '/ws/fundamentals-timeseries/v1/finance/timeseries/AAPL',
    ]) expect(allowedYahooGetPath(path)).toBe(true)
    for (const path of ['/v1/anything', '/v7/download/AAPL', '/ws/other', '/v8/finance/chart/A/B']) {
      expect(allowedYahooGetPath(path)).toBe(false)
    }
  })

  it('rejects unsupported Yahoo paths without contacting upstream', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const response = await worker.fetch(new Request('https://worker.test/v7/download/AAPL'), {})
    expect(response.status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('bounds the one proxied POST before reading or forwarding it', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const response = await worker.fetch(new Request('https://worker.test/v1/finance/visualization', {
      method: 'POST', headers: { 'Content-Length': String(65 * 1024) }, body: '{}',
    }), {})
    expect(response.status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })
})

describe('cnSecurity — the East Money id for a Yahoo-shaped HK / mainland symbol', () => {
  it('maps each venue and zero-pads Hong Kong to five digits', () => {
    expect(cnSecurity('0700.HK')).toEqual({ market: 'hk', code: '00700' })
    expect(cnSecurity('600036.SS')).toEqual({ market: 'sh', code: '600036' })
    expect(cnSecurity('000630.sz')).toEqual({ market: 'sz', code: '000630' })
  })

  it('refuses anything that is not one of the three venues', () => {
    expect(cnSecurity('AAPL')).toBeNull()
    expect(cnSecurity('RY.TO')).toBeNull()
    expect(cnSecurity('12345678.SS')).toBeNull()
    expect(cnSecurity('')).toBeNull()
  })
})

describe('cnF10Upstream — mainland statements, every parameter validated', () => {
  it('builds the F10 statement URL for a valid query', () => {
    expect(cnF10Upstream({ stmt: 'lrb', market: 'sh', code: '600036', ct: '3', reportType: '1', dates: '2025-12-31,2024-12-31' }))
      .toBe('https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/lrbAjaxNew?companyType=3&reportDateType=0&reportType=1&dates=2025-12-31,2024-12-31&code=SH600036')
  })
  it('refuses unknown statements, Hong Kong codes, bad company types and junk dates', () => {
    expect(cnF10Upstream({ stmt: 'secret', market: 'sh', code: '600036', ct: '1', dates: '2025-12-31' })).toBeNull()
    expect(cnF10Upstream({ stmt: 'lrb', market: 'hk', code: '00700', ct: '1', dates: '2025-12-31' })).toBeNull()
    expect(cnF10Upstream({ stmt: 'lrb', market: 'sh', code: '600036', ct: '9', dates: '2025-12-31' })).toBeNull()
    expect(cnF10Upstream({ stmt: 'lrb', market: 'sh', code: '600036', ct: '1', dates: 'today' })).toBeNull()
    expect(cnF10Upstream({ stmt: 'lrb', market: 'sh', code: '600036', ct: '1', dates: Array(9).fill('2025-12-31').join(',') })).toBeNull()
  })
})
