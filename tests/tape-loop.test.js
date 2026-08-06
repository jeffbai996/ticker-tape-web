import { describe, expect, it } from 'vitest'
import { tapeEntries } from '../src/lib/tape.js'

describe('tapeEntries', () => {
  // The cycle is duplicated end to end, so where the seam falls matters:
  // it lands on a price, not mid-headline (order flipped 2026-08-05 when
  // headlines started being spread through the quotes rather than blocked
  // at the head of the belt).
  it('builds one complete cycle whose seam lands on a quote', () => {
    const headlines = [{ id: 7, headline: 'Chip capex accelerates' }]
    const quotes = [{ symbol: 'AAPL', q: { price: 123.45 } }]

    expect(tapeEntries(headlines, quotes).map(({ kind, data }) => [kind, data.id || data.symbol]))
      .toEqual([
        ['quote', 'AAPL'],
        ['headline', 7],
      ])
  })
})
