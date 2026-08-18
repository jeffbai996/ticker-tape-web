/** The front-page market deck (`MARKET_DECK`, rendered by the dashboard's
 *  Global markets panel). It is the only macro read on the landing page, so
 *  what it must cover — and what every row must be able to do — is pinned
 *  here rather than left to whoever edits the list next.
 *
 *  Every symbol below was checked against the live Worker quote path on
 *  2026-08-18: all of them return a price. The regex and translation checks
 *  are the parts a test can keep honest afterwards.
 */
import { describe, expect, it } from 'vitest'
import { MARKET_DECK } from '../../src/lib/markets.js'
import { SYMBOL_RE } from '../../src/lib/symbols.js'
import { hasLabelTranslation } from '../../src/lib/i18n.js'

describe('every deck row is well formed', () => {
  it('uses symbols the rest of the app will accept', () => {
    // watchlists, catalysts and the research route all gate on this regex —
    // a deck row the router cannot resolve is a dead link on the front page
    for (const { symbol } of MARKET_DECK) expect(SYMBOL_RE.test(symbol)).toBe(true)
  })

  it('carries a short label, in both languages', () => {
    for (const { symbol, label } of MARKET_DECK) {
      expect(label, symbol).toBeTruthy()
      // the cell is a 9px uppercase truncate beside a right-aligned number;
      // past ~16 characters it clips on a 390px phone rather than wrapping
      expect(label.length, label).toBeLessThanOrEqual(16)
      expect(hasLabelTranslation(label), `zh label for ${label}`).toBe(true)
    }
  })

  it('lists each instrument once', () => {
    const symbols = MARKET_DECK.map((item) => item.symbol)
    expect(new Set(symbols).size).toBe(symbols.length)
  })

  it('fills the two-column grid evenly', () => {
    // the panel is grid-cols-2 with an odd:border-r rule; an odd count leaves
    // a half row with a rule running into empty space
    expect(MARKET_DECK.length % 2).toBe(0)
  })
})

describe('the deck covers the macro complex', () => {
  const has = (symbol) => MARKET_DECK.some((item) => item.symbol === symbol)

  it('reads US equity across sizes', () => {
    for (const s of ['^GSPC', '^NDX', '^DJI', '^RUT']) expect(has(s), s).toBe(true)
  })

  it('reads equity outside the US', () => {
    for (const s of ['^STOXX50E', '^N225']) expect(has(s), s).toBe(true)
  })

  it('reads the curve, not just the 10-year', () => {
    // Yahoo's Treasury series are ^IRX (13-week bill), ^FVX (5Y), ^TNX (10Y)
    // and ^TYX (30Y) — there is no 2-year series to add, so the front end is
    // the bill. Front/belly-adjacent/long is enough to see the shape move.
    for (const s of ['^IRX', '^TNX', '^TYX']) expect(has(s), s).toBe(true)
  })

  it('reads the dollar and the two crosses that move with it', () => {
    for (const s of ['DX-Y.NYB', 'EURUSD=X', 'USDJPY=X']) expect(has(s), s).toBe(true)
  })

  it('reads metals, energy and the industrial cycle', () => {
    for (const s of ['GC=F', 'SI=F', 'HG=F', 'CL=F', 'NG=F']) expect(has(s), s).toBe(true)
  })

  it('reads risk appetite in both vol and credit', () => {
    expect(has('^VIX')).toBe(true)
    // HYG earns its slot because nothing else here prices credit. A duration
    // ETF would not: TLT's move is the inverse of ^TNX/^TYX, already shown.
    expect(has('HYG')).toBe(true)
    expect(has('TLT')).toBe(false)
  })

  it('still reads crypto', () => {
    expect(has('BTC-USD')).toBe(true)
  })
})
