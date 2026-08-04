import { describe, expect, it, beforeEach } from 'vitest'
import { setWireUrl, wireUrl, demoBackfill, demoEvent, demoToday, demoQuotes, rankEvents, collapseSessions, clusterStories, TYPE_CODE } from '../../src/lib/wire.js'

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
      expect(['AAPL', 'MSFT', 'NVDA', 'GOOG', 'AMZN', 'TSLA']).toContain(s)
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

describe('collapseSessions', () => {
  const now = 1_000_000
  const audio = (id, type, sid, body, extra = {}) => ({
    id, type, symbols: ['AAPL'], ts_event: now - 10, ts_seen: now - 10,
    body, meta: { session_id: sid, ...extra },
  })

  it('folds a session into one live_call card with counts and latest snippet', () => {
    const out = collapseSessions([
      audio(1, 'transcript_chunk', 5, 'first words', { seq: 0, label: 'Q2 call' }),
      audio(2, 'transcript_chunk', 5, 'later words', { seq: 1 }),
      audio(3, 'digest', 5, 'the digest', { digest_n: 1 }),
      { id: 4, type: 'headline', symbols: ['MSFT'], ts_event: now, ts_seen: now, headline: 'x', meta: {} },
    ], now)
    const card = out.find((e) => e.type === 'live_call')
    expect(card.headline).toContain('2 chunks · 1 digests')
    expect(card.headline).toContain('LIVE')
    expect(card.headline).toContain('later words')
    expect(card.headline).toContain('Q2 call')
    expect(card.live_call.digests).toHaveLength(1)
    expect(card.live_call.tail.map((c) => c.id)).toEqual([1, 2])
    // non-audio events pass through untouched
    expect(out.find((e) => e.id === 4).type).toBe('headline')
  })

  it('a finished session loses the LIVE tag', () => {
    const stale = [audio(1, 'transcript_chunk', 5, 'w', { seq: 0 })]
    stale[0].ts_seen = now - 600
    const card = collapseSessions(stale, now)[0]
    expect(card.headline).not.toContain('LIVE')
  })
})

describe('clusterStories', () => {
  const now = 1_000_000
  const h = (id, headline, url, ageMin = 0) => ({
    id, type: 'headline', symbols: [], headline, url,
    ts_event: now - ageMin * 60, ts_seen: now - ageMin * 60, meta: {},
  })

  it('folds near-identical headlines from different outlets into one row', () => {
    const out = clusterStories([
      h(1, 'BP Puts UK North Sea Business Up for Sale', 'https://wsj.com/a', 30),
      h(2, 'BP puts North Sea oil business up for sale - Reuters', 'https://news.google.com/x', 20),
      h(3, 'BP to sell UK North Sea business', 'https://bbc.co.uk/b', 10),
      h(4, 'Fed officials eye rate hike', 'https://cnbc.com/c', 5),
    ], now)
    const cluster = out.find((e) => e.story_cluster)
    expect(cluster.story_cluster.count).toBe(3)
    expect(out.filter((e) => /BP/.test(e.headline))).toHaveLength(1)
    expect(out.find((e) => /Fed officials/.test(e.headline))).toBeTruthy()
    // the representative is the highest-tier source (wsj beats bbc/google)
    expect(cluster.url).toContain('wsj.com')
    // members keep their identities for the expansion
    expect(cluster.story_cluster.members.map((m) => m.id).sort()).toEqual([1, 2, 3])
  })

  it('does not cluster stories that merely share a word', () => {
    const out = clusterStories([
      h(1, 'Apple launches new iPhone lineup today', 'https://a/1'),
      h(2, 'Apple orchard yields hit record in Washington', 'https://a/2'),
    ], now)
    expect(out).toHaveLength(2)
    expect(out.every((e) => !e.story_cluster)).toBe(true)
  })

  it('keeps singletons untouched and preserves non-headline events', () => {
    const ev = { id: 9, type: 'earnings_release', symbols: ['NVDA'], headline: 'NVDA reports', ts_event: now, ts_seen: now, meta: {} }
    const out = clusterStories([ev, h(1, 'one lonely story about zinc markets', 'https://a/1')], now)
    expect(out).toHaveLength(2)
    expect(out.find((e) => e.id === 9)).toBe(ev)
  })
})
