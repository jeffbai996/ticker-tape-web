import { describe, expect, it } from 'vitest'
import { tapeworthy } from '../../src/lib/wire.js'

const NOW = 1_700_000_000
const ev = (over = {}) => ({
  id: 1, headline: 'Chip capex accelerates', type: 'headline',
  ts_event: NOW - 600, meta: { thesis: 2 }, ...over,
})

describe('tapeworthy', () => {
  it('takes thesis-critical headlines', () => {
    expect(tapeworthy([ev()], { now: NOW })).toHaveLength(1)
  })

  it('drops low-relevance chatter', () => {
    expect(tapeworthy([ev({ meta: { thesis: 1 } })], { now: NOW })).toHaveLength(0)
    expect(tapeworthy([ev({ meta: {} })], { now: NOW })).toHaveLength(0)
  })

  // typed events carry their own category (ERN/FIL/FED/MACRO) — the whole
  // point of the tape badge — and a filing doesn't need a triage score to be
  // worth a slot (Jeff 2026-08-05: "is there nothing more informative")
  it('takes typed signal events on their own merit', () => {
    for (const type of ['earnings_release', 'filing', 'fed_headline',
                        'fed_speech', 'macro_print']) {
      expect(tapeworthy([ev({ type, meta: {} })], { now: NOW })).toHaveLength(1)
    }
  })

  it('still drops untyped chatter that the triage scored low', () => {
    expect(tapeworthy([ev({ type: 'headline', meta: { thesis: 1 } })], { now: NOW }))
      .toHaveLength(0)
  })

  it('always takes price moves, whatever the triage said', () => {
    const out = tapeworthy([ev({ type: 'price_move', meta: {} })], { now: NOW })
    expect(out).toHaveLength(1)
  })

  it('drops anything past the age window', () => {
    expect(tapeworthy([ev({ ts_event: NOW - 7 * 3600 })], { now: NOW })).toHaveLength(0)
    expect(tapeworthy([ev({ ts_event: NOW - 7 * 3600 })], { now: NOW, maxAgeH: 8 })).toHaveLength(1)
  })

  it('skips events with no headline text', () => {
    expect(tapeworthy([ev({ headline: '' })], { now: NOW })).toHaveLength(0)
  })

  it('returns newest first and honours the limit', () => {
    const rows = [
      ev({ id: 1, ts_event: NOW - 3000, headline: 'old' }),
      ev({ id: 2, ts_event: NOW - 100, headline: 'new' }),
      ev({ id: 3, ts_event: NOW - 900, headline: 'mid' }),
    ]
    const out = tapeworthy(rows, { now: NOW, limit: 2 })
    expect(out.map((e) => e.headline)).toEqual(['new', 'mid'])
  })

  it('survives an empty or missing feed', () => {
    expect(tapeworthy([], { now: NOW })).toEqual([])
    expect(tapeworthy(null, { now: NOW })).toEqual([])
  })
})
