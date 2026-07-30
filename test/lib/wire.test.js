import { describe, expect, it, beforeEach } from 'vitest'
import { setWireUrl, wireUrl, demoBackfill, demoEvent, demoToday, demoQuotes, rankEvents, TYPE_CODE } from '../../src/lib/wire.js'

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

describe('priority ranking (fragwire scorer port)', () => {
  const now = 1_000_000
  const ev = (id, type, symbols = [], ageH = 0, meta = {}) => ({
    id, type, symbols, ts_event: now - ageH * 3600, ts_seen: now, meta,
  })

  it('earnings outrank headlines; watchlist multiplies; age decays', () => {
    const watch = new Set(['NVDA'])
    const ranked = rankEvents([
      ev(1, 'headline', ['NVDA']),           // 40 × 1.5
      ev(2, 'earnings_release', ['AAPL']),   // 100
      ev(3, 'earnings_release', ['NVDA'], 80), // 100 × 1.5 × decay(80h) ≈ 16
    ], watch, now)
    expect(ranked.map((e) => e.id)).toEqual([2, 1, 3])
  })

  it('collapses transcript chatter to the newest chunk per session', () => {
    const ranked = rankEvents([
      ev(1, 'transcript_chunk', ['AAPL'], 0, { session_id: 7 }),
      ev(2, 'transcript_chunk', ['AAPL'], 0, { session_id: 7 }),
      ev(3, 'transcript_chunk', ['TSLA'], 0, { session_id: 9 }),
    ], new Set(), now)
    expect(ranked.map((e) => e.id).sort()).toEqual([2, 3])
  })
})

describe('demo rail data', () => {
  it('today payload mirrors the wire /api/today shape', () => {
    const t = demoToday(1_000_000)
    expect(t.calendar[0].ts).toBeGreaterThan(1_000_000)
    expect(t.upcoming.length).toBeGreaterThan(0)
    expect(t.sessions.some((s) => s.status === 'capturing')).toBe(true)
    expect(Object.values(t.captured).every((n) => n > 0)).toBe(true)
    // demo provenance is visible, and only generic tickers appear
    expect(t.calendar[0].label).toContain('demo')
  })

  it('demo quotes carry change_pct for every symbol', () => {
    for (const q of Object.values(demoQuotes())) {
      expect(typeof q.change_pct).toBe('number')
    }
  })
})
