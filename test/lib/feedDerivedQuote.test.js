// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { chartDerivedQuote } from '../../src/lib/feed.js'

describe('chartDerivedQuote — the fallback day quote (A31 F5)', () => {
  it('keeps change and pct null when no previous close exists', () => {
    // Yahoo meta without previousClose, single-bar history (delisted/halted/
    // freshly listed): the day change is UNKNOWN, not a flat 0.00%.
    const q = chartDerivedQuote({ regularMarketPrice: 42.1 }, [42.1])
    expect(q.price).toBe(42.1)
    expect(q.change).toBeNull()
    expect(q.pct).toBeNull()
    expect(q.prevClose).toBeNull()
  })

  it('also stays null when the chart itself is empty', () => {
    const q = chartDerivedQuote({}, [])
    expect(q.price).toBe(0)
    expect(q.change).toBeNull()
    expect(q.pct).toBeNull()
  })

  it('derives the day change from the last two closes when meta has none', () => {
    const q = chartDerivedQuote({}, [100, 105])
    expect(q.price).toBe(105)
    expect(q.change).toBeCloseTo(5)
    expect(q.pct).toBeCloseTo((5 / 100) * 100)
    expect(q.prevClose).toBe(100)
  })

  it('lets the meta previousClose win over the closes array', () => {
    const q = chartDerivedQuote({ regularMarketPrice: 102, previousClose: 100 }, [100, 101])
    expect(q.change).toBeCloseTo(2)
    expect(q.pct).toBeCloseTo(2)
    expect(q.prevClose).toBe(100)
  })

  it('does not invent a flat change from a zero price', () => {
    const q = chartDerivedQuote({ regularMarketPrice: 0, previousClose: 10 }, [10, 0])
    expect(q.change).toBeNull()
    expect(q.pct).toBeNull()
  })
})
