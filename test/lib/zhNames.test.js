/** Chinese company-name search: Yahoo's search returns nothing for a
 *  Chinese query (verified 2026-08-22), so a zh reader adding a holding by
 *  name needs a local table consulted before the provider. The table is
 *  generated from the exchanges (scripts/gen_zh_names.py) and lazy-loaded. */
import { beforeAll, describe, expect, it } from 'vitest'
import { hasCjk, loadZhTable, zhAliasHits, zhKnownSymbols, zhName } from '../../src/lib/zhNames.js'

beforeAll(async () => { await loadZhTable() })

describe('zhAliasHits', () => {
  it('finds a listing by its simplified name, prefix first', () => {
    const hits = zhAliasHits('腾讯')
    expect(hits[0]).toMatchObject({ symbol: '0700.HK', name: '腾讯控股', exch: 'HKG', type: 'EQUITY' })
  })

  it('accepts the traditional form a Hong Kong broker prints', () => {
    expect(zhAliasHits('騰訊')[0].symbol).toBe('0700.HK')
    expect(zhAliasHits('中國人壽')[0].symbol).toBe('2628.HK')
  })

  it('lists every listing that shares a name, not just one', () => {
    const syms = zhAliasHits('中国人寿').map((h) => h.symbol)
    expect(syms).toContain('2628.HK')
    expect(syms).toContain('601628.SS')
  })

  it('still hits when the query merely contains the name', () => {
    expect(zhAliasHits('买点比亚迪').map((h) => h.symbol)).toContain('002594.SZ')
    expect(zhAliasHits('比亚迪').map((h) => h.symbol)).toEqual(expect.arrayContaining(['1211.HK', '002594.SZ']))
  })

  it('answers nothing before the chunk lands, never a wrong name', async () => {
    // a fresh module instance: nothing loaded yet
    const fresh = await import('../../src/lib/zhNames.js?fresh=' + Math.random())
    expect(fresh.zhName('0700.HK')).toBeNull()
    expect(fresh.zhAliasHits('腾讯')).toEqual([])
    await fresh.loadZhTable()
    expect(fresh.zhName('0700.HK')).toBe('腾讯控股')
  })

  it('stays out of the way for Latin queries and single characters', () => {
    expect(zhAliasHits('tencent')).toEqual([])
    expect(zhAliasHits('腾')).toEqual([])
    expect(hasCjk('AAPL')).toBe(false)
    expect(hasCjk('中芯')).toBe(true)
  })

  it('marks funds as ETF so the venue flag and filters treat them right', () => {
    // the generated table carries every 沪深300 tracker, so the flagship is
    // one of several hits, not necessarily the first
    const csi = zhAliasHits('沪深300', { limit: 50 })
    expect(csi.find((h) => h.symbol === '510300.SS')).toMatchObject({ type: 'ETF' })
    expect(zhAliasHits('盈富')[0]).toMatchObject({ symbol: '2800.HK', type: 'ETF' })
  })
})

describe('zhName', () => {
  it('names a known symbol in either script and null otherwise', () => {
    expect(zhName('0981.hk')).toBe('中芯国际')
    expect(zhName('0981.HK', { traditional: true })).toBe('中芯國際')
    expect(zhName('AAPL')).toBeNull()
  })

  it('covers the family book that motivated it — every row has a name', () => {
    // the stepdad's 20 holdings as repaired 2026-08-22; the table exists for
    // exactly this reader, so losing one of these is a regression
    const book = ['2628.HK', '1378.HK', '0700.HK', '2899.HK', '0966.HK', '2099.HK',
      '513090.SS', '600489.SS', '3330.HK', '2050.HK', '000630.SZ', '600036.SS',
      '1818.HK', '7709.HK', '513050.SS', '000657.SZ', '300308.SZ', '688008.SS',
      '6869.HK', '0981.HK']
    for (const s of book) expect(zhName(s), s).not.toBeNull()
    expect(zhKnownSymbols().length).toBeGreaterThan(8000)   // every listing, generated
  })
})
