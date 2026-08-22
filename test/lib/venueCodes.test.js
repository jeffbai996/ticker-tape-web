/** Bare exchange codes are not tickers (Jeff 2026-08-21: his stepdad typed
 *  "02628" and the book valued it as a USD nothing). Yahoo has no bare
 *  numeric symbol on any venue, so a digits-only string is always broken —
 *  which makes rewriting it strictly an improvement, never a regression.
 */
import { describe, expect, it } from 'vitest'
import { codeSearchQueries, normalizeVenueCode } from '../../src/lib/venueCodes.js'

describe('normalizeVenueCode — a board code to the symbol the feed knows', () => {
  it('pads Hong Kong board codes to four digits and suffixes them', () => {
    expect(normalizeVenueCode('02628')).toBe('2628.HK')     // China Life
    expect(normalizeVenueCode('00700')).toBe('0700.HK')     // Tencent
    expect(normalizeVenueCode('700')).toBe('0700.HK')
    expect(normalizeVenueCode('07709')).toBe('7709.HK')     // 5-digit derivative line
    expect(normalizeVenueCode('03330')).toBe('3330.HK')
  })

  it('routes six-digit mainland codes to their own exchange', () => {
    expect(normalizeVenueCode('600036')).toBe('600036.SS')  // Shanghai main board
    expect(normalizeVenueCode('688008')).toBe('688008.SS')  // STAR market
    expect(normalizeVenueCode('513050')).toBe('513050.SS')  // Shanghai-listed ETF
    expect(normalizeVenueCode('000630')).toBe('000630.SZ')  // Shenzhen main board
    expect(normalizeVenueCode('300308')).toBe('300308.SZ')  // ChiNext
    expect(normalizeVenueCode('159915')).toBe('159915.SZ')  // Shenzhen-listed ETF
  })

  it('leaves anything that already names a venue — or a real ticker — alone', () => {
    expect(normalizeVenueCode('AAPL')).toBe('AAPL')
    expect(normalizeVenueCode('2628.HK')).toBe('2628.HK')
    expect(normalizeVenueCode('RY.TO')).toBe('RY.TO')
    expect(normalizeVenueCode('BRK-B')).toBe('BRK-B')
    expect(normalizeVenueCode('^GSPC')).toBe('^GSPC')
    expect(normalizeVenueCode('aapl')).toBe('AAPL')
  })

  it('gives up rather than guess when the digit count fits no board', () => {
    expect(normalizeVenueCode('1234567')).toBe('1234567')
    expect(normalizeVenueCode('')).toBe('')
  })
})

describe('codeSearchQueries — the gate has to leave a way through', () => {
  it('also asks for the venue symbol a bare board code most likely means', () => {
    expect(codeSearchQueries('02628')).toEqual(['02628', '2628.HK'])
    expect(codeSearchQueries('600489')).toEqual(['600489', '600489.SS'])
  })

  it('asks once for anything that already reads as a symbol or a name', () => {
    expect(codeSearchQueries('AAPL')).toEqual(['AAPL'])
    expect(codeSearchQueries('apple')).toEqual(['apple'])
    expect(codeSearchQueries('2628.HK')).toEqual(['2628.HK'])
    expect(codeSearchQueries('  ')).toEqual([])
  })
})
