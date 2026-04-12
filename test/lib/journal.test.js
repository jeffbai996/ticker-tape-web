import { describe, it, expect } from 'vitest'
import { loadEntries, addEntry, removeEntry, searchEntries } from '../../src/lib/journal.js'

// localStorage cleared in test/setup.js before each test

describe('loadEntries', () => {
  it('returns empty array when no entries stored', () => {
    expect(loadEntries()).toEqual([])
  })
})

describe('addEntry', () => {
  it('adds entry and returns it', () => {
    const e = addEntry('Bought 100 NVDA at support level.')
    expect(e.id).toBe(1)
    expect(e.text).toBe('Bought 100 NVDA at support level.')
    expect(e.ts).toBeTruthy()
  })
  it('extracts ticker symbols from text', () => {
    const e = addEntry('Long NVDA and AAPL going into earnings.')
    expect(e.symbols).toContain('NVDA')
    expect(e.symbols).toContain('AAPL')
  })
  it('deduplicates extracted symbols', () => {
    const e = addEntry('NVDA NVDA NVDA is great')
    expect(e.symbols.filter(s => s === 'NVDA')).toHaveLength(1)
  })
  it('filters stopwords from symbols', () => {
    const e = addEntry('I AM IN THE market')
    // I, AM, IN, THE are stopwords
    expect(e.symbols).toHaveLength(0)
  })
  it('increments id for each entry', () => {
    const e1 = addEntry('First entry')
    const e2 = addEntry('Second entry')
    expect(e2.id).toBe(e1.id + 1)
  })
  it('persists entry in storage', () => {
    addEntry('Test entry')
    expect(loadEntries()).toHaveLength(1)
  })
  it('trims to MAX_ENTRIES (500)', () => {
    // Add 502 entries, should keep only last 500
    for (let i = 0; i < 502; i++) {
      addEntry(`Entry ${i}`)
    }
    expect(loadEntries()).toHaveLength(500)
  })
})

describe('removeEntry', () => {
  it('removes entry by id', () => {
    const e = addEntry('Test entry')
    removeEntry(e.id)
    expect(loadEntries()).toHaveLength(0)
  })
  it('leaves other entries intact', () => {
    const e1 = addEntry('First')
    const e2 = addEntry('Second')
    removeEntry(e1.id)
    const remaining = loadEntries()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(e2.id)
  })
})

describe('searchEntries', () => {
  it('matches by text content (case-insensitive)', () => {
    addEntry('Bought NVDA at support')
    addEntry('Sold AAPL at resistance')
    const results = searchEntries('nvda')
    expect(results).toHaveLength(1)
    expect(results[0].text).toContain('NVDA')
  })
  it('matches by extracted symbol', () => {
    addEntry('Interesting move on AAPL today')
    const results = searchEntries('AAPL')
    expect(results).toHaveLength(1)
  })
  it('returns empty array when no matches', () => {
    addEntry('Bought NVDA')
    expect(searchEntries('TSLA')).toHaveLength(0)
  })
  it('returns all matching entries', () => {
    addEntry('NVDA earnings')
    addEntry('NVDA breakout')
    addEntry('AAPL earnings')
    expect(searchEntries('earnings')).toHaveLength(2)
  })
})

// ── extractSymbols (pure logic — tested via addEntry) ─
describe('symbol extraction edge cases', () => {
  it('ignores 1-letter matches', () => {
    // Single uppercase letters like "I" are stopwords; non-stopword 1-letter like "X"
    // The regex is /\b[A-Z]{1,5}\b/g and filter is m.length >= 2
    const e = addEntry('X Y Z are letters')
    // X, Y, Z are single chars, length < 2, so filtered out
    expect(e.symbols).toHaveLength(0)
  })
  it('extracts 2-5 letter uppercase words', () => {
    const e = addEntry('Check MU and LRCX today')
    expect(e.symbols).toContain('MU')
    expect(e.symbols).toContain('LRCX')
  })
  it('ignores lowercase words', () => {
    const e = addEntry('nvda aapl are lowercase')
    expect(e.symbols).toHaveLength(0)
  })
  it('handles common trading stopwords', () => {
    // BUY, PUT, SET, RED, etc. are in STOPWORDS
    const e = addEntry('BUY PUT SET RED options')
    expect(e.symbols).toHaveLength(0)
  })
  it('handles empty text', () => {
    const e = addEntry('')
    expect(e.symbols).toEqual([])
  })
})
