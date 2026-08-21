import { describe, it, expect } from 'vitest'
import { assembleBriefing, renderBriefing, briefingPrompt, memoPrompt } from '../../src/lib/briefing.js'

const q = (symbol, pct, price = 100, extra = {}) => ({
  quote: { symbol, price, pct, change: (price * pct) / 100, ...extra },
  tech: null,
})

const QUOTES = {
  AAA: q('AAA', 4.2),
  BBB: q('BBB', -3.1),
  CCC: q('CCC', 0.5),
  DDD: { quote: { symbol: 'DDD', price: 50, pct: 1.2, change: 0.6 }, tech: { rsi: 74, volRatio: 2.3, offHigh: -2 } },
  EEE: q('EEE', -0.2),
}

const INDICES = [
  { symbol: 'SPX', label: 'S&P 500' },
  { symbol: 'VIXX', label: 'VIX' },
]
const IDX_QUOTES = { SPX: q('SPX', -0.8, 6800), VIXX: q('VIXX', 5.0, 21.4) }

describe('assembleBriefing', () => {
  const sections = assembleBriefing({
    watchlist: Object.keys(QUOTES),
    quotes: QUOTES,
    indices: INDICES,
    indexQuotes: IDX_QUOTES,
    earnDays: { AAA: 3, CCC: 40 },
    econEvents: [{ type: 'CPI', label: 'CPI Release', days: 2 }],
  })

  it('ranks gainers and losers by day change', () => {
    expect(sections.movers.gainers[0].symbol).toBe('AAA')
    expect(sections.movers.losers[0].symbol).toBe('BBB')
    // flat names are not movers
    expect(sections.movers.gainers.every((m) => m.pct > 0)).toBe(true)
    expect(sections.movers.losers.every((m) => m.pct < 0)).toBe(true)
  })

  it('carries the macro strip with labels', () => {
    expect(sections.macro).toEqual([
      { label: 'S&P 500', price: 6800, pct: -0.8 },
      { label: 'VIX', price: 21.4, pct: 5 },
    ])
  })

  it('keeps only near-term earnings (within 14 days)', () => {
    expect(sections.earnings).toEqual([{ symbol: 'AAA', days: 3 }])
  })

  it('flags technical extremes as notes', () => {
    const note = sections.techNotes.find((n) => n.symbol === 'DDD')
    expect(note).toBeTruthy()
    const texts = note.notes.map((x) => x.text).join(' ')
    expect(texts).toMatch(/overbought · RSI 74/)
    expect(texts).toMatch(/heavy tape · 2.3x/)
    expect(note.notes.map((x) => x.kind)).toEqual(['overbought', 'volume'])
  })

  it('keeps technical flags actionable instead of listing 52-week drawdowns', () => {
    const sections = assembleBriefing({
      watchlist: ['DRAW', 'ACTIVE'],
      quotes: {
        DRAW: { quote: { symbol: 'DRAW', price: 10, pct: -1 }, tech: { offHigh: -67 } },
        ACTIVE: { quote: { symbol: 'ACTIVE', price: 10, pct: 1 }, tech: { rsi: 75, offHigh: -44 } },
      },
    })
    expect(sections.techNotes.map((n) => n.symbol)).toEqual(['ACTIVE'])
    expect(sections.techNotes.flatMap((n) => n.notes.map((x) => x.text)).join(' ')).not.toMatch(/52w|off high/i)
  })

  it('computes breadth pulse', () => {
    expect(sections.pulse.adv).toBe(3)
    expect(sections.pulse.dec).toBe(2)
  })
})

describe('renderBriefing', () => {
  it('renders a plain-text block with all sections', () => {
    const sections = assembleBriefing({
      watchlist: Object.keys(QUOTES),
      quotes: QUOTES,
      indices: INDICES,
      indexQuotes: IDX_QUOTES,
      earnDays: { AAA: 3 },
      econEvents: [{ type: 'FOMC', label: 'FOMC Rate Decision', days: 6 }],
    })
    const text = renderBriefing(sections)
    expect(text).toMatch(/MACRO/)
    expect(text).toMatch(/S&P 500 6800.00 -0.80%/)
    expect(text).toMatch(/AAA \+4.20%/)
    expect(text).toMatch(/FOMC/)
    expect(text).toMatch(/AAA reports in 3d/)
  })
})

describe('prompts', () => {
  it('briefingPrompt embeds the briefing text', () => {
    const p = briefingPrompt('BRIEFING BODY')
    expect(p).toMatch(/BRIEFING BODY/)
    expect(p.toLowerCase()).toMatch(/most important/)
  })

  it('memoPrompt embeds symbol facts and asks for a memo', () => {
    const p = memoPrompt('AAA', {
      quote: { price: 123.45, pct: 1.5 },
      tech: { rsi: 55, above50: true, above200: true, volRatio: 1.1, offHigh: -4, rs: 2 },
      earnDays: 9,
    })
    expect(p).toMatch(/AAA/)
    expect(p).toMatch(/123.45/)
    expect(p).toMatch(/RSI 55/)
    expect(p.toLowerCase()).toMatch(/memo/)
  })
})
