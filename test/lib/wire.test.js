import { describe, expect, it, beforeEach } from 'vitest'
import { mirrorBase, setWireUrl, wireUrl, calendarSubscriptionUrl, demoBackfill, demoEvent, demoToday, demoQuotes, rankEvents, collapseSessions, clusterStories, toggleWireArticle, TYPE_CODE, pubDisplayName, readMinutes, effectiveEventTime, sortWireLatest, tierOfEvent, matchesWireRelevance } from '../../src/lib/wire.js'

describe('wire article accordion', () => {
  it('replaces the open article and lets the active article close', () => {
    const current = new Set([11])
    expect([...toggleWireArticle(current, 22)]).toEqual([22])
    expect([...current]).toEqual([11])
    expect([...toggleWireArticle(new Set([22]), 22)]).toEqual([])
  })
})

describe('wire endpoint config', () => {
  beforeEach(() => localStorage.clear())

  it('stores and normalizes a BYO endpoint', () => {
    expect(setWireUrl('http://my-wire.local:8095/')).toBe('http://my-wire.local:8095')
    expect(wireUrl()).toBe('http://my-wire.local:8095')
  })

  it('rejects non-http schemes', () => {
    expect(() => setWireUrl('ftp://x')).toThrow()
  })

  // Clearing the box no longer means "demo": the public build falls back to
  // the read-only mirror, and only drops to demo if that is unreachable.
  it('blank clears back to the public mirror', () => {
    setWireUrl('http://my-wire.local:8095')
    setWireUrl('')
    expect(localStorage.getItem('tape-wire-url')).toBe(null)
    expect(wireUrl()).toBe(mirrorBase())
  })

  it('builds a calendar subscription URL from the configured wire', () => {
    setWireUrl('https://wire.example.com:8459')
    expect(calendarSubscriptionUrl()).toBe('webcal://wire.example.com:8459/calendar.ics')
  })
})

describe('demo wire', () => {
  it('fills a desktop page when the earnings filter is selected', () => {
    const earnings = demoBackfill().filter((e) => e.type === 'earnings_release')
    expect(earnings.length).toBeGreaterThanOrEqual(14)
  })

  it('generates a stable synthetic backfill with generic tickers only', () => {
    const evs = demoBackfill(24, 1_000_000)
    expect(evs).toHaveLength(24)
    // Generic large-caps only — this page is public, so the demo feed must
    // never echo a real book. Asserting the SHAPE (uppercase tickers, no
    // exotic instruments) rather than a copied list, which only drifts.
    const syms = new Set(evs.flatMap((e) => e.symbols))
    expect(syms.size).toBeGreaterThan(3)
    for (const s of syms) {
      expect(s).toMatch(/^[A-Z]{1,5}$/)
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

describe('wire ordering and relevance controls', () => {
  const now = 1_000_000
  const event = (id, tsEvent, extra = {}) => ({
    id, type: 'headline', headline: 'story', symbols: [],
    ts_event: tsEvent, ts_seen: tsEvent + 1, meta: {}, ...extra,
  })

  it('sorts latest by effective event time and demotes bad future stamps', () => {
    const future = event(3, now + 3600, { ts_seen: now - 30 })
    const rows = sortWireLatest([
      event(1, now - 120), future, event(2, now - 10),
    ], now)

    expect(rows.map((row) => row.id)).toEqual([2, 3, 1])
    expect(effectiveEventTime(future, now)).toBe(now - 30)
  })

  it('combines exact tier selections and thesis/source gates', () => {
    const watchset = new Set(['AAPL'])
    const t1 = event(1, now, { meta: { thesis: 1 }, url: 'https://reuters.com/a' })
    const t2 = event(2, now, { meta: { thesis: 2 }, url: 'https://reuters.com/b' })
    const t3 = event(3, now, { symbols: ['AAPL'], meta: { thesis: 2 }, url: 'https://reuters.com/c' })

    expect([t1, t2, t3].filter((row) => matchesWireRelevance(
      row, watchset, { tiers: new Set([1, 3]) },
    )).map((row) => row.id)).toEqual([1, 3])
    expect(matchesWireRelevance(t1, watchset, { thesisOnly: true, primeOnly: true })).toBe(true)
    expect(matchesWireRelevance(t1, watchset, { thesisOnly: true, primeOnly: true,
      tiers: new Set([2]) })).toBe(false)
  })

  it('caps a content-mill thesis story below T3', () => {
    const row = event(1, now, {
      symbols: ['AAPL'], meta: { thesis: 2 },
      url: 'https://www.fool.com/investing/story',
    })
    expect(tierOfEvent(row, new Set(['AAPL']))).toBe(2)
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

  const typed = (id, type, headline, url, ageMin = 0) => ({
    id, type, symbols: [], headline, url,
    ts_event: now - ageMin * 60, ts_seen: now - ageMin * 60, meta: {},
  })

  it('folds multi-source reprints of a filing into one row', () => {
    const out = clusterStories([
      typed(1, 'filing', 'MSFT files 8-K: $60B buyback authorisation approved', 'https://sec.gov/a', 20),
      typed(2, 'filing', 'MSFT 8-K discloses $60B buyback authorisation approved', 'https://reuters.com/b', 10),
    ], now)
    expect(out).toHaveLength(1)
    expect(out[0].story_cluster.count).toBe(2)
    expect(out[0].url).toContain('reuters.com')     // ranked source is the face
    expect(out[0].id).toBe(2)                        // newest member carries the row
  })

  it('folds the same macro print arriving from several desks', () => {
    const out = clusterStories([
      typed(1, 'macro_print', 'US CPI rises 0.2% monthly, core cooler than expected', 'https://a/1', 12),
      typed(2, 'macro_print', 'CPI rises 0.2% monthly with core cooler than expected', 'https://b/2', 11),
      typed(3, 'macro_print', 'Initial claims 214k, four-week average lowest since March', 'https://c/3', 9),
    ], now)
    expect(out).toHaveLength(2)
    expect(out.find((e) => e.story_cluster).story_cluster.count).toBe(2)
  })

  it('folds an earnings release reprinted by two feeds', () => {
    const out = clusterStories([
      typed(1, 'earnings_release', 'JPM third quarter EPS $4.92 versus $4.61 estimate', 'https://a/1', 5),
      typed(2, 'earnings_release', 'JPM third quarter EPS $4.92 versus $4.61 estimate', 'https://wsj.com/b', 4),
    ], now)
    expect(out).toHaveLength(1)
    expect(out[0].story_cluster.count).toBe(2)
  })

  // an ERN and the write-up about it are two different reads
  it('never clusters across types', () => {
    const text = 'JPM third quarter EPS $4.92 versus $4.61 estimate'
    const out = clusterStories([
      typed(1, 'earnings_release', text, 'https://a/1', 5),
      typed(2, 'headline', text, 'https://wsj.com/b', 4),
    ], now)
    expect(out).toHaveLength(2)
    expect(out.every((e) => !e.story_cluster)).toBe(true)
  })

  it('leaves types outside the collapse set alone', () => {
    const a = typed(1, 'digest', 'AAPL call digest: services margin 74.1% and guide raised', 'https://a/1', 5)
    const b = typed(2, 'digest', 'AAPL call digest: services margin 74.1% and guide raised', 'https://a/2', 4)
    const out = clusterStories([a, b], now)
    expect(out).toEqual([a, b])
  })
})

describe('tapeworthy banner policy', () => {
  const now = 1_700_000_000
  const mk = (over = {}) => ({
    id: 1, type: 'headline', symbols: ['MU'], ts_event: now - 60, ts_seen: now,
    headline: 'Micron Has Surged. Brace for a Steep Pullback.',
    url: 'https://www.fool.com/investing/2026/micron.aspx',
    meta: { thesis: 2 }, ...over,
  })

  it('keeps content-mill stories off the banner even at thesis 2+', async () => {
    const { tapeworthy } = await import('../../src/lib/wire.js')
    expect(tapeworthy([mk()], { now })).toHaveLength(0)
  })

  it('still carries the same story from a ranked outlet', async () => {
    const { tapeworthy } = await import('../../src/lib/wire.js')
    const ev = mk({ url: 'https://www.reuters.com/technology/micron.html', headline: 'Micron cuts HBM capacity' })
    expect(tapeworthy([ev], { now })).toHaveLength(1)
  })

  it('never blocks self-made hard events, which carry no source to rate', async () => {
    const { tapeworthy } = await import('../../src/lib/wire.js')
    const ev = mk({ type: 'price_move', url: '', headline: 'MU -4.2% on volume' })
    expect(tapeworthy([ev], { now })).toHaveLength(1)
  })
})

describe('matchesWireQuery', () => {
  const ev = { symbols: ['AMD', 'NVDA'], headline: 'AMD MI400 sampling ahead of schedule' }

  it('passes everything through on an empty query', async () => {
    const { matchesWireQuery } = await import('../../src/lib/wire.js')
    expect(matchesWireQuery(ev, '')).toBe(true)
    expect(matchesWireQuery(ev, '   ')).toBe(true)
  })

  it('matches a tagged symbol case-insensitively', async () => {
    const { matchesWireQuery } = await import('../../src/lib/wire.js')
    expect(matchesWireQuery(ev, 'nvda')).toBe(true)
    expect(matchesWireQuery(ev, ' AMD ')).toBe(true)
  })

  // a substring symbol test would drag every AMD/AMZN row in on "am"
  it('does not match a symbol on a partial ticker', async () => {
    const { matchesWireQuery } = await import('../../src/lib/wire.js')
    expect(matchesWireQuery({ symbols: ['AMZN'], headline: 'quiet tape' }, 'am')).toBe(false)
  })

  it('falls through to a headline substring', async () => {
    const { matchesWireQuery } = await import('../../src/lib/wire.js')
    expect(matchesWireQuery(ev, 'sampling')).toBe(true)
    expect(matchesWireQuery(ev, 'CoWoS')).toBe(false)
  })

  it('survives rows with no symbols or no headline', async () => {
    const { matchesWireQuery } = await import('../../src/lib/wire.js')
    expect(matchesWireQuery({}, 'mu')).toBe(false)
    expect(matchesWireQuery({}, 'mu', 'zh')).toBe(false)
  })

  // the rows paint headline_zh/body_zh on zh, so the filter has to search them
  it('matches the zh text a zh reader can actually see', async () => {
    const { matchesWireQuery } = await import('../../src/lib/wire.js')
    const zhEv = {
      symbols: ['NVDA'], headline: 'NVDA secures extra CoWoS capacity',
      body: 'Capacity booked through 2027.',
      meta: { headline_zh: '英伟达锁定额外 CoWoS 产能', body_zh: '产能已订至 2027 年。' },
    }
    expect(matchesWireQuery(zhEv, '产能', 'zh')).toBe(true)
    expect(matchesWireQuery(zhEv, '订至', 'zh')).toBe(true)
    // English still works on zh — the source headline stays in the haystack
    expect(matchesWireQuery(zhEv, 'capacity', 'zh')).toBe(true)
    expect(matchesWireQuery(zhEv, '黄金', 'zh')).toBe(false)
  })

  it('leaves the en haystack as the headline alone', async () => {
    const { matchesWireQuery } = await import('../../src/lib/wire.js')
    const evz = { symbols: [], headline: 'plain english headline', body: 'buried in the body',
                  meta: { headline_zh: '中文标题' } }
    expect(matchesWireQuery(evz, '中文', 'en')).toBe(false)
    expect(matchesWireQuery(evz, 'buried', 'en')).toBe(false)
    expect(matchesWireQuery(evz, 'english')).toBe(true)
  })
})

describe('reader byline', () => {
  it('spells the publication name in plain english', () => {
    expect(pubDisplayName({ url: 'https://www.semafor.com/article/x' })).toBe('Semafor')
    expect(pubDisplayName({ url: 'https://www.ft.com/content/abc' })).toBe('Financial Times')
    expect(pubDisplayName({ url: 'https://feeds.reuters.com/x' })).toBe('Reuters')
    expect(pubDisplayName({ url: 'https://spectrum.ieee.org/x' })).toBe('IEEE Spectrum')
  })

  it('pulls the true source out of a google-news headline tail', () => {
    expect(pubDisplayName({
      url: 'https://news.google.com/rss/articles/x',
      headline: 'Chips rally on earnings - The Elec',
    })).toBe('The Elec')
  })

  it('falls back to a capitalized stem, then the source field', () => {
    expect(pubDisplayName({ url: 'https://stocktwits.com/news/x' })).toBe('Stocktwits')
    expect(pubDisplayName({ url: 'not a url', source: 'prices' })).toBe('Prices')
    expect(pubDisplayName({})).toBe('')
  })

  it('estimates reading minutes for latin and cjk text', () => {
    expect(readMinutes('word '.repeat(440))).toBe(2)
    expect(readMinutes('字'.repeat(700))).toBe(2)
    expect(readMinutes('short text')).toBe(1)
    expect(readMinutes('')).toBe(0)
    expect(readMinutes(null)).toBe(0)
  })
})
