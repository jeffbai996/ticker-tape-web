/** Chinese market data through the worker: the parsers are the contract. */
import { describe, expect, it } from 'vitest'
import { isCnListing, parseCnIndustry, parseCnNews, parseCnProfile, readableCnUrl } from '../../src/lib/cnData.js'

describe('isCnListing', () => {
  it('covers the three venues and nothing else', () => {
    expect(isCnListing('0700.HK')).toBe(true)
    expect(isCnListing('600036.ss')).toBe(true)
    expect(isCnListing('000630.SZ')).toBe(true)
    expect(isCnListing('AAPL')).toBe(false)
    expect(isCnListing('RY.TO')).toBe(false)
  })
})

describe('parseCnNews', () => {
  it('flattens East Money search rows newest first, tags stripped', () => {
    const out = parseCnNews({ result: { cmsArticleWebOld: [
      { date: '2026-08-19 17:46:23', title: '腾讯控股：回购<em>67.3万</em>股', content: '港交所文件显示…', mediaName: '界面新闻', url: 'http://x/1' },
      { date: '2026-08-21 17:57:12', title: '腾讯控股于8月21日回购', content: '', mediaName: '证券时报', url: 'http://x/2' },
      { date: '2026-08-20 09:00:00', title: '', url: 'http://x/3' },
    ] } })
    expect(out.map((r) => r.url)).toEqual(['http://x/2', 'http://x/1'])
    expect(out[1].title).toBe('腾讯控股：回购67.3万股')
    expect(out[0].source).toBe('证券时报')
    expect(out[0].ts).toBeGreaterThan(out[1].ts)
  })

  it('is empty, not a crash, on an error payload', () => {
    expect(parseCnNews({ error: 'cn upstream HTTP 406' })).toEqual([])
    expect(parseCnNews(null)).toEqual([])
  })
})

describe('parseCnProfile', () => {
  it('reads the Hong Kong shape', () => {
    const p = parseCnProfile({ zqzl: { ssrq: '2004/6/16 0:00:00', jys: '香港交易所' },
      gszl: { gsmc: '腾讯控股有限公司', ywmc: 'Tencent Holdings Limited', gsjs: '  腾讯控股有限公司是一家…', dsz: '马化腾' } })
    expect(p).toMatchObject({ name: '腾讯控股有限公司', nameEn: 'Tencent Holdings Limited', listed: '2004-6-16', exchange: '香港交易所', chairman: '马化腾' })
    expect(p.profile.startsWith('腾讯控股')).toBe(true)
  })

  it('reads the A-share shape and carries the industry string', () => {
    const p = parseCnProfile({ jbzl: [{ ORG_NAME: '招商银行股份有限公司', ORG_NAME_EN: 'China Merchants Bank Co., Ltd.',
      ORG_PROFILE: ' 招商银行…', BUSINESS_SCOPE: '吸收公众存款;…', EM2016: '金融-银行-股份制与城商行', TRADE_MARKET: '上海证券交易所' }] })
    expect(p).toMatchObject({ name: '招商银行股份有限公司', industry: '金融-银行-股份制与城商行', exchange: '上海证券交易所' })
    expect(p.business.startsWith('吸收')).toBe(true)
  })

  it('is null when neither shape is present', () => {
    expect(parseCnProfile({})).toBeNull()
  })
})

describe('parseCnIndustry', () => {
  it('lifts f127 for Hong Kong and the middle EM2016 tier for the mainland', () => {
    expect(parseCnIndustry({ data: { f57: '00700', f127: '软件服务' } })).toBe('软件服务')
    expect(parseCnIndustry({ jbzl: [{ EM2016: '金融-银行-股份制与城商行' }] })).toBe('银行')
    expect(parseCnIndustry({ jbzl: [{ EM2016: '有色金属' }] })).toBe('有色金属')
    expect(parseCnIndustry({ data: {} })).toBe('')
    expect(parseCnIndustry(undefined)).toBe('')
  })
})

describe('readableCnUrl', () => {
  it('accepts East Money story pages and nothing else', () => {
    expect(readableCnUrl('https://finance.eastmoney.com/a/202608193846389234.html')).toBe(true)
    expect(readableCnUrl('http://finance.eastmoney.com/a/202608193846389234.html')).toBe(true)
    expect(readableCnUrl('https://finance.yahoo.com/news/x.html')).toBe(false)
    expect(readableCnUrl('https://evil.com/a/202608193846389234.html')).toBe(false)
  })
})
