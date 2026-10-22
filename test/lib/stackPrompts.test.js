// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { bookPrompts, stackPrompts } from '../../src/lib/stackPrompts.js'

const q = (price, extra = {}) => ({ quote: { price, pct: 0.5 }, ...extra })
const growth = { id: 'g', name: 'Growth', positions: [
  { symbol: 'AAPL', shares: 10, avg_cost: 100 },
  { symbol: 'MSFT', shares: 2, avg_cost: 500 },
  { symbol: 'GOOGL', shares: 4, avg_cost: 100 },
  { symbol: 'AMZN', shares: 1, avg_cost: 300 },
] }
const income = { id: 'i', name: 'Income', positions: [
  { symbol: 'AAPL', shares: 5, avg_cost: 150 },
  { symbol: '0005.HK', shares: 400, avg_cost: 60 },
] }
const quotes = { AAPL: q(200), MSFT: q(400), GOOGL: q(150), AMZN: q(180), '0005.HK': q(70) }
const names = (out) => out.map((p) => p.name)

describe('portfolio-fitted prompts', () => {
  it('names the largest position and its weight in a single-currency book', () => {
    const top = bookPrompts({ books: [growth], quotes }).find((p) => p.name === 'book_top')
    // AAPL 2000 of 3580 total
    expect(top.params).toEqual({ symbol: 'AAPL', book: 'Growth', pct: '56' })
  })
  it('flags a name held in more than one book', () => {
    const overlap = bookPrompts({ books: [growth, income], quotes }).find((p) => p.name === 'book_overlap')
    expect(overlap.params).toEqual({ symbol: 'AAPL', n: 2 })
  })
  it('asks about the deepest loss and the largest gain against cost', () => {
    const out = bookPrompts({ books: [growth], quotes })
    expect(out.find((p) => p.name === 'book_underwater').params).toMatchObject({ symbol: 'AMZN', pct: '40' })
    expect(out.find((p) => p.name === 'book_winner').params).toMatchObject({ symbol: 'AAPL', pct: '100' })
  })
  it('ties an upcoming report to the book that holds the name', () => {
    const out = bookPrompts({ books: [growth], quotes, earnDays: { MSFT: 5 } })
    expect(out.find((p) => p.name === 'book_earnings').params).toEqual({ symbol: 'MSFT', book: 'Growth', days: 5 })
  })
  it('stress-tests each book against its home market and notices a currency mix', () => {
    const out = bookPrompts({ books: [growth, income], quotes })
    expect(out.filter((p) => p.name.startsWith('book_stress_')).map((p) => p.name)).toEqual(['book_stress_us', 'book_stress_us'])
    expect(out.find((p) => p.name === 'book_currency_mix').params.book).toBe('Income')
    expect(names(out)).toContain('book_hk_flows')
    expect(out.find((p) => p.name === 'book_compare').params).toEqual({ book: 'Growth', other: 'Income' })
  })
  it('skips price-based prompts when quotes are missing instead of guessing', () => {
    const out = bookPrompts({ books: [growth], quotes: {} })
    expect(names(out)).not.toContain('book_top')
    expect(names(out)).not.toContain('book_underwater')
    expect(names(out)).toContain('book_correlation')
  })
  it('tags every prompt with a depth level', () => {
    for (const p of bookPrompts({ books: [growth, income], quotes, earnDays: { MSFT: 5 } })) expect([1, 2, 3]).toContain(p.lvl)
  })
  it('returns nothing without books', () => {
    expect(bookPrompts({ books: [], quotes })).toEqual([])
  })
  it('leaves out a book with no name rather than asking about undefined', () => {
    const unnamed = { positions: growth.positions }
    expect(bookPrompts({ books: [unnamed], quotes })).toEqual([])
    const out = bookPrompts({ books: [unnamed, income], quotes })
    expect(out.every((p) => Object.values(p.params || {}).every((v) => v !== undefined))).toBe(true)
  })
})

describe('stack prompts', () => {
  it('builds analyst questions on held names before watchlist names', () => {
    const out = stackPrompts({ held: ['0005.HK'], watchlist: ['TSLA'], edition: 0 })
    expect(out.length).toBeGreaterThan(4)
    expect(out[0].params.symbol).toBe('0005.HK')
    expect(out.every((p) => p.lvl >= 2)).toBe(true)
  })
  it('rotates which names are asked about between editions', () => {
    const a = stackPrompts({ held: ['AAPL', 'MSFT'], watchlist: [], edition: 0 })[0].params.symbol
    const b = stackPrompts({ held: ['AAPL', 'MSFT'], watchlist: [], edition: 1 })[0].params.symbol
    expect(a).not.toBe(b)
  })
})

it('leads with findings specific to the books before questions any book could ask', () => {
  const out = bookPrompts({ books: [growth, income], quotes })
  expect(out[0].name).toBe('book_overlap')
  expect(out.findIndex((p) => p.name === 'book_underwater')).toBeLessThan(out.findIndex((p) => p.name === 'book_correlation'))
})
