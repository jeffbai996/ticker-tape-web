import { cnF10Upstream, cnSecurity, extractEmArticle } from '../../worker/worker.js'
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

describe('extractEmArticle — the reader gets text, never chrome', () => {
  const page = `<html><head><title>腾讯控股：回购67.3万股股份_东方财富网</title></head><body>
    <div class="infos"><div class=" item">2026年08月19日 17:46</div><div class="item">界面新闻</div></div>
    <div class="txtinfos" id="ContentBody" style="margin-top:0;"><!--文章主体-->
      <p>　　港交所文件显示，<span id="Info.116.00700">腾讯控股</span>于8月19日回购673,000股，耗资3亿港元。</p>
      <div class="ad_context3"><script>ads()</script><p>广告</p></div>
      <p>第二段&nbsp;内容。</p>
      <p class="em_media">（文章来源：界面新闻）</p>
      <p>（责任编辑：张三）</p>
      <p>打开微信，</p><p>点击底部的“发现”</p>
    </div></body></html>`
  it('lifts title, time, source and the body paragraphs', () => {
    const a = extractEmArticle(page)
    expect(a.title).toBe('腾讯控股：回购67.3万股股份')
    expect(a.time).toBe('2026年08月19日 17:46')
    expect(a.source).toBe('界面新闻')
    expect(a.paras).toEqual(['港交所文件显示，腾讯控股于8月19日回购673,000股，耗资3亿港元。', '第二段 内容。'])
  })
  it('is empty, not a crash, without a body', () => {
    expect(extractEmArticle('<html><title>x</title></html>').paras).toEqual([])
    expect(extractEmArticle(null).paras).toEqual([])
  })
})
