import { describe, expect, it, beforeEach } from 'vitest'
import { setWireUrl, wireUrl, demoBackfill, demoEvent, TYPE_CODE } from '../../src/lib/wire.js'

describe('wire endpoint config', () => {
  beforeEach(() => localStorage.clear())

  it('stores and normalizes a BYO endpoint', () => {
    expect(setWireUrl('http://my-wire.local:8095/')).toBe('http://my-wire.local:8095')
    expect(wireUrl()).toBe('http://my-wire.local:8095')
  })

  it('rejects non-http schemes', () => {
    expect(() => setWireUrl('ftp://x')).toThrow()
  })

  it('blank clears back to demo mode', () => {
    setWireUrl('http://my-wire.local:8095')
    setWireUrl('')
    expect(wireUrl()).toBe('')
  })
})

describe('demo wire', () => {
  it('generates a stable synthetic backfill with generic tickers only', () => {
    const evs = demoBackfill(24, 1_000_000)
    expect(evs).toHaveLength(24)
    const syms = new Set(evs.flatMap((e) => e.symbols))
    for (const s of syms) {
      expect(['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA']).toContain(s)
    }
    expect(evs.every((e) => e.demo)).toBe(true)
    // deterministic: same id + clock, same event
    expect(demoEvent(3, 1_000_000)).toEqual(demoEvent(3, 1_000_000))
  })

  it('macro shapes carry no symbols', () => {
    const macro = demoBackfill(24, 1_000_000).filter((e) => e.type === 'macro_print')
    expect(macro.length).toBeGreaterThan(0)
    expect(macro.every((e) => e.symbols.length === 0)).toBe(true)
  })

  it('every demo type has a display code', () => {
    for (const e of demoBackfill(24, 1_000_000)) {
      expect(TYPE_CODE[e.type]).toBeTruthy()
    }
  })
})
