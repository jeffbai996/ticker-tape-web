import { describe, expect, it } from 'vitest'
import { tapeEntries } from '../src/lib/tape.js'

describe('tapeEntries', () => {
  it('builds one complete headline-then-quote cycle for seamless duplication', () => {
    const headlines = [{ id: 7, headline: 'Chip capex accelerates' }]
    const quotes = [{ symbol: 'AAPL', q: { price: 123.45 } }]

    expect(tapeEntries(headlines, quotes).map(({ kind, data }) => [kind, data.id || data.symbol]))
      .toEqual([
        ['headline', 7],
        ['quote', 'AAPL'],
      ])
  })
})
