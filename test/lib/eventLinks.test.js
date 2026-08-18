import { afterEach, describe, expect, it } from 'vitest'
import { setLocale, tl } from '../../src/lib/i18n.js'
import { SYMBOL_RE } from '../../src/lib/symbols.js'
import {
  EVENT_LINKS, LIVE_WINDOW_MS,
  MAX_KIND_CHARS,
  etOffsetMinutes, eventAlertPlan, eventClock, eventKind, eventLinkedSymbols,
  eventNarrative, eventNumbers, eventPhase, eventReaction, eventSurprise,
  formatCountdown, parseNumeric, sectorEtfFor,
} from '../../src/lib/eventLinks.js'

afterEach(() => setLocale('en'))

// The only instruments this repo is allowed to name: index proxies, sector and
// theme ETFs, and macro hedges. Anything company-specific has to arrive from a
// user's own event (a catalyst or an earnings row), never from a shipped map.
const PUBLIC_UNIVERSE = new Set([
  'SPY', 'QQQ', 'IWM', 'DIA', 'RSP', 'EFA', 'EEM',
  'TLT', 'IEF', 'SHY', 'TIP', 'HYG', 'LQD', 'BND',
  'GLD', 'SLV', 'UUP', 'USO', 'DBC',
  'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
  'XHB', 'ITB', 'XRT', 'KRE', 'SMH', 'SOXX', 'IGV', 'IYT', 'JETS', 'URA',
  '^VIX', '^TNX', '^GSPC',
])

describe('event link mapping', () => {
  it('describes every kind in plain language and links it to instruments', () => {
    const kinds = Object.keys(EVENT_LINKS)
    expect(kinds.length).toBeGreaterThan(10)
    for (const kind of kinds) {
      const entry = EVENT_LINKS[kind]
      expect(entry.plain.length).toBeGreaterThan(10)
      expect(entry.matters.length).toBeGreaterThan(10)
      expect(entry.sectors.length).toBeGreaterThan(0)
      expect(entry.symbols.length).toBeGreaterThan(0)
      for (const link of entry.symbols) {
        expect(link.why.length).toBeGreaterThan(4)
        expect(SYMBOL_RE.test(link.symbol)).toBe(true)
      }
    }
  })

  it('ships only public index, sector, and macro instruments', () => {
    for (const entry of Object.values(EVENT_LINKS)) {
      for (const link of entry.symbols) {
        expect(PUBLIC_UNIVERSE.has(link.symbol)).toBe(true)
      }
    }
  })

  it('routes the rate-sensitive prints to rates, banks, property, and builders', () => {
    const cpi = eventLinkedSymbols({ type: 'CPI' }).map((l) => l.symbol)
    expect(cpi).toEqual(expect.arrayContaining(['TLT', 'XLF', 'XLRE', 'XHB']))
    const fomc = eventLinkedSymbols({ type: 'FOMC' }).map((l) => l.symbol)
    expect(fomc).toEqual(expect.arrayContaining(['TLT', 'GLD', 'XLF']))
  })

  it('routes the growth prints to the index complex', () => {
    const nfp = eventLinkedSymbols({ type: 'NFP' }).map((l) => l.symbol)
    expect(nfp).toEqual(expect.arrayContaining(['SPY', 'QQQ', 'IWM']))
  })

  it('leads an earnings event with the reporting symbol and its sector ETF', () => {
    const links = eventLinkedSymbols({ type: 'ERN', symbol: 'AAPL' })
    expect(links[0].symbol).toBe('AAPL')
    expect(links.map((l) => l.symbol)).toContain(sectorEtfFor('AAPL'))
    expect(sectorEtfFor('AAPL')).toBe('XLK')
    expect(sectorEtfFor('JPM')).toBe('XLF')
    expect(sectorEtfFor('ZZZZ')).toBe('SPY')
  })

  it('leads a user catalyst with its own symbol without duplicating it', () => {
    const links = eventLinkedSymbols({ type: 'PRODUCT', user: true, symbol: 'MSFT' })
    expect(links[0].symbol).toBe('MSFT')
    expect(links.filter((l) => l.symbol === 'MSFT')).toHaveLength(1)
    const macro = eventLinkedSymbols({ type: 'MACRO', user: true, symbol: 'MACRO' })
    expect(macro.map((l) => l.symbol)).not.toContain('MACRO')
    expect(macro.length).toBeGreaterThan(0)
  })

  it('degrades an unknown kind to the broad market instead of throwing', () => {
    const links = eventLinkedSymbols({ type: 'WAT', label: 'something new' })
    expect(links.map((l) => l.symbol)).toContain('SPY')
    expect(eventKind({ type: 'ern' })).toBe('ERN')
    expect(eventKind({})).toBe('OTHER')
  })

  it('bounds an unknown kind before it reaches the badge', () => {
    // a calendar row is remote input and `kind` is rendered verbatim, so the
    // passthrough is capped and stripped rather than trusted
    const long = eventKind({ type: 'a'.repeat(400) })
    expect(long).toBe('A'.repeat(MAX_KIND_CHARS))
    expect(long.length).toBe(MAX_KIND_CHARS)
    expect(eventKind({ type: '<img src=x onerror=alert(1)>' }))
      .toBe('IMGSRCXONERR')
    expect(eventKind({ type: 'jobs report' })).toBe('JOBSREPORT')
    expect(eventKind({ type: '  ' })).toBe('OTHER')     // nothing printable
    expect(eventKind({ type: '***' })).toBe('OTHER')
    expect(eventKind({ type: 42 })).toBe('42')
    // a known kind is never touched by the sanitiser
    expect(eventKind({ type: 'FOMC' })).toBe('FOMC')
    // and an unknown one still resolves to the broad-market workspace
    expect(eventNarrative({ type: 'a'.repeat(400) }).plain)
      .toBe(EVENT_LINKS.OTHER.plain)
  })

  it('prefers the event own description over the shipped one', () => {
    const own = eventNarrative({ type: 'CPI', description: 'a bespoke line' })
    expect(own.plain).toBe('a bespoke line')
    expect(own.matters).toBe(EVENT_LINKS.CPI.matters)
    expect(eventNarrative({ type: 'CPI' }).plain).toBe(EVENT_LINKS.CPI.plain)
  })

  it('translates the shipped narratives and sectors', () => {
    setLocale('zh')
    expect(tl(EVENT_LINKS.CPI.plain)).not.toBe(EVENT_LINKS.CPI.plain)
    expect(tl(EVENT_LINKS.FOMC.matters)).not.toBe(EVENT_LINKS.FOMC.matters)
    expect(tl(EVENT_LINKS.NFP.symbols[0].why)).not.toBe(EVENT_LINKS.NFP.symbols[0].why)
  })
})

describe('event numbers', () => {
  it('reads prior, consensus, and actual across the field names sources use', () => {
    expect(eventNumbers({ previous: 2.9, consensus: 3.1, actual: 3.4 }))
      .toMatchObject({ prior: 2.9, consensus: 3.1, actual: 3.4 })
    expect(eventNumbers({ prior: '2.9%', estimate: '3.1%', actual: '3.4%' }))
      .toMatchObject({ prior: 2.9, consensus: 3.1, actual: 3.4, unit: '%' })
    expect(eventNumbers({ numbers: { previous: '1,204', forecast: '1,300' } }))
      .toMatchObject({ prior: 1204, consensus: 1300, actual: null })
  })

  it('never invents a number the source did not carry', () => {
    const empty = eventNumbers({ type: 'CPI' })
    expect(empty).toEqual({ prior: null, consensus: null, actual: null, unit: '' })
    expect(eventNumbers(null)).toEqual({
      prior: null, consensus: null, actual: null, unit: '',
    })
    expect(parseNumeric('n/a')).toBe(null)
    expect(parseNumeric('-0.2%')).toBe(-0.2)
    expect(parseNumeric(0)).toBe(0)
  })

  it('reports the surprise only when both sides of it exist', () => {
    expect(eventSurprise({ consensus: 3.1, actual: 3.4 }))
      .toMatchObject({ delta: 0.3, direction: 'above' })
    expect(eventSurprise({ consensus: 3.1, actual: 2.8 }).direction).toBe('below')
    expect(eventSurprise({ consensus: 3.1, actual: 3.1 }).direction).toBe('inline')
    expect(eventSurprise({ consensus: null, actual: 3.4 })).toBe(null)
    expect(eventSurprise({ consensus: 3.1, actual: null })).toBe(null)
  })
})

describe('event clock', () => {
  it('resolves an ET release time to an instant on both sides of DST', () => {
    expect(etOffsetMinutes('2026-07-14')).toBe(-240)
    expect(etOffsetMinutes('2026-01-14')).toBe(-300)
    const summer = eventClock({ date: '2026-07-14' }, '08:30 ET')
    expect(summer.at).toBe(Date.parse('2026-07-14T12:30:00Z'))
    expect(summer.exact).toBe(true)
    const winter = eventClock({ date: '2026-01-14' }, '08:30 ET')
    expect(winter.at).toBe(Date.parse('2026-01-14T13:30:00Z'))
  })

  it('falls back to the cash open when the source has no clock time', () => {
    const allDay = eventClock({ date: '2026-06-19' }, 'All session')
    expect(allDay.exact).toBe(false)
    expect(allDay.at).toBe(Date.parse('2026-06-19T13:30:00Z'))
    expect(eventClock({}, '08:30 ET').at).toBe(null)
  })

  it('moves from pre through the release window to post', () => {
    const at = Date.parse('2026-07-14T12:30:00Z')
    expect(eventPhase(at, at - 60_000)).toBe('pre')
    expect(eventPhase(at, at)).toBe('live')
    expect(eventPhase(at, at + LIVE_WINDOW_MS - 1)).toBe('live')
    expect(eventPhase(at, at + LIVE_WINDOW_MS)).toBe('post')
    expect(eventPhase(null, at)).toBe('pre')
  })

  it('counts down in fixed-width mono fields', () => {
    expect(formatCountdown(0)).toBe('00:00:00')
    expect(formatCountdown(-5_000)).toBe('00:00:00')
    expect(formatCountdown(3_723_000)).toBe('01:02:03')
    expect(formatCountdown(2 * 86_400_000 + 3_723_000)).toBe('2d 01:02:03')
  })
})

describe('event reaction', () => {
  const at = Date.parse('2026-07-14T12:30:00Z')
  const sec = (iso) => Date.parse(iso) / 1000
  const links = [{ symbol: 'TLT', why: 'rates' }, { symbol: 'XLF', why: 'banks' }]
  const bars = {
    TLT: [
      { time: sec('2026-07-14T12:00:00Z'), close: 100 },
      { time: sec('2026-07-14T12:25:00Z'), close: 101 },
      { time: sec('2026-07-14T13:00:00Z'), close: 99 },
      { time: sec('2026-07-14T14:00:00Z'), close: 98.99 },
    ],
  }

  it('measures each linked symbol from the last print before the release', () => {
    const out = eventReaction(links, { bars, quotes: {}, at })
    expect(out.ready).toBe(true)
    const tlt = out.rows.find((r) => r.symbol === 'TLT')
    expect(tlt.base).toBe(101)
    expect(tlt.last).toBe(98.99)
    expect(tlt.pct).toBeCloseTo(-1.99, 2)
    expect(tlt.source).toBe('bars')
  })

  it('falls back to the session move and stays honest when there is nothing', () => {
    const out = eventReaction(links, {
      bars, quotes: { XLF: { price: 51, prevClose: 50 } }, at,
    })
    const xlf = out.rows.find((r) => r.symbol === 'XLF')
    expect(xlf.source).toBe('session')
    expect(xlf.pct).toBeCloseTo(2, 6)

    const blank = eventReaction(links, { bars: {}, quotes: {}, at })
    expect(blank.ready).toBe(false)
    expect(blank.rows.every((r) => r.pct === null && r.source === null)).toBe(true)
    expect(blank.rows.map((r) => r.symbol)).toEqual(['TLT', 'XLF'])
  })

  it('needs a print on both sides of the timestamp before it claims a reaction', () => {
    const preOnly = { TLT: bars.TLT.slice(0, 2) }
    const out = eventReaction(links, { bars: preOnly, quotes: {}, at })
    expect(out.rows[0].source).toBe(null)
    expect(eventReaction(links, { bars, quotes: {}, at: null }).ready).toBe(false)
  })
})

describe('event alert plan', () => {
  it('states the channel, cooldown, and hourly budget before anything is armed', () => {
    const plan = eventAlertPlan({
      symbol: 'SPY',
      price: 500,
      delivery: { enabled: true, destination: 'desk', maxPerHour: 4 },
      destinations: [{ key: 'desk', label: 'ops desk' }],
    })
    expect(plan.channel).toBe('ops desk')
    expect(plan.channelKind).toBe('discord')
    expect(plan.maxPerHour).toBe(4)
    expect(plan.cooldownMinutes).toBe(15)
    expect(plan.suggested).toMatchObject({ operator: '>', value: 510 })
    expect(plan.ready).toBe(true)
  })

  it('says browser only when delivery is off or the channel is gone', () => {
    const off = eventAlertPlan({ symbol: 'SPY', price: 500 })
    expect(off.channelKind).toBe('browser')
    expect(off.channel).toBe('browser only')
    expect(off.cooldownMinutes).toBe(10)
    const missing = eventAlertPlan({
      symbol: 'SPY',
      delivery: { enabled: true, destination: 'gone', maxPerHour: 6 },
      destinations: [{ key: 'desk', label: 'ops desk' }],
    })
    expect(missing.channelKind).toBe('browser')
    expect(missing.suggested).toBe(null)
    expect(eventAlertPlan({}).ready).toBe(false)
  })
})
