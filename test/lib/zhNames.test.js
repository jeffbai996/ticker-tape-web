/** Chinese company-name search: Yahoo's search returns nothing for a
 *  Chinese query (verified 2026-08-22), so a zh reader adding a holding by
 *  name needs a local table consulted before the provider. The table is
 *  generated from the exchanges (scripts/gen_zh_names.py) and lazy-loaded. */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { hasCjk, loadMissingZhName, loadZhTable, localName, onZhTable, zhAliasHits, zhKnownSymbols, zhName } from '../../src/lib/zhNames.js'
import { setLocale } from '../../src/lib/i18n.js'

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
    expect(zhName('ZZZZ.XX')).toBeNull()
  })

  it('names the US large-caps too, so a mixed book reads in one script', () => {
    expect(zhName('AAPL')).toMatch(/苹果/)
    expect(zhName('NVDA')).toMatch(/英伟达/)
    expect(zhAliasHits('英伟达').map((h) => h.symbol)).toContain('NVDA')
    expect(zhAliasHits('英伟达')[0].exch).toBe('')   // venue unknown from the symbol alone
  })

  it('keeps Alphabet attached to its Chinese name', () => {
    expect(zhName('GOOGL')).toBe('谷歌')
  })

  it('uses spaced provider names when a generated entry is English-only', () => {
    expect(zhName('PLTR')).toBeNull()
    expect(zhName('0033.HK')).toBeNull()
    setLocale('zh')
    try {
      expect(localName('PLTR', 'Palantir Technologies Inc.')).toBe('Palantir Technologies Inc.')
      expect(localName('0033.HK', 'International Genius Company')).toBe('International Genius Company')
      expect(localName('CRM', 'Salesforce, Inc.')).toBe('赛富时公司')
    } finally {
      setLocale('en')
    }
  })

  it('fills a missing US translation from the bounded remote fallback', async () => {
    const lookup = vi.fn().mockResolvedValue('示例公司')
    let changes = 0
    const off = onZhTable(() => { changes += 1 })
    await expect(loadMissingZhName('QZX', { lookup })).resolves.toBe('示例公司')
    expect(lookup).toHaveBeenCalledWith('QZX')
    expect(zhName('QZX')).toBe('示例公司')
    expect(changes).toBeGreaterThan(1)
    off()
  })

  it('names well-known HK, Shanghai and Shenzhen listings — every row has a name', () => {
    // large-cap and ETF examples across the HK main board, Shanghai main /
    // STAR / ETF and Shenzhen main / ChiNext lines; the table exists for a
    // Chinese-language reader, so losing one of these is a regression
    const listings = ['0005.HK', '0388.HK', '0939.HK', '0941.HK', '1299.HK', '1398.HK',
      '1810.HK', '2318.HK', '3690.HK', '9618.HK', '9988.HK', '0001.HK',
      '600519.SS', '601318.SS', '510300.SS', '510050.SS', '688981.SS',
      '000001.SZ', '000858.SZ', '300750.SZ']
    for (const s of listings) expect(zhName(s), s).not.toBeNull()
    expect(zhKnownSymbols().length).toBeGreaterThan(8000)   // every listing, generated
  })
})

import { loadZhTable as _load, zhName as _zh } from '../../src/lib/zhNames.js'

describe('US share classes', () => {
  it('finds BRK-B whichever way the class suffix is spelled', async () => {
    await _load()
    expect(_zh('BRK-B')).toBeTruthy()
    expect(_zh('BRK-B')).toBe(_zh('BRK.B'))
    expect(_zh('brk-b')).toBe(_zh('BRK.B'))
  })
})
