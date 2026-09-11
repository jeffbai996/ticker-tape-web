import { describe, expect, it } from 'vitest'
import { extendedLabelClass, extendedQuoteStale } from '../../src/lib/extendedHours.js'
import { quoteFromV7 } from '../../src/lib/yahoo.js'

describe('extended quote freshness', () => {
  it('ages a quiet quote even without a price change', () => {
    const q = { extMarketTime: 1000, marketTime: 900 }
    expect(extendedQuoteStale(q, 1299)).toBe(false)
    expect(extendedQuoteStale(q, 1300)).toBe(true)
    expect(extendedQuoteStale({ ...q, extMarketTime: 1290 }, 1300)).toBe(false)
  })
  it('mutes unknown timestamps and prints older than the regular session', () => {
    expect(extendedQuoteStale({}, 1300)).toBe(true)
    expect(extendedQuoteStale({ extMarketTime: 0 }, 1300)).toBe(true)
    expect(extendedQuoteStale({ extMarketTime: 1290, marketTime: 1295 }, 1300)).toBe(true)
  })
  it('preserves provider times for both REST extended sessions', () => {
    expect(quoteFromV7({ marketState: 'PRE', preMarketPrice: 10, preMarketTime: 123 }).extMarketTime).toBe(123)
    expect(quoteFromV7({ marketState: 'POST', postMarketPrice: 10, postMarketTime: 456 }).extMarketTime).toBe(456)
  })
})

describe('extendedLabelClass', () => {
  it('uses distinct session colors for overnight, pre-market, and after-hours', () => {
    // lemon, not the UI amber — ON in accent read as chrome (Jeff 2026-08-05)
    expect(extendedLabelClass('ON')).toBe('text-[#fde047]')
    expect(extendedLabelClass('PM')).toBe('text-[#5ba8d9]')
    expect(extendedLabelClass('AH')).toBe('text-[#c084fc]')
  })

  it('keeps unknown provider labels legible', () => {
    expect(extendedLabelClass('UNKNOWN')).toBe('text-ink-2')
  })
})
