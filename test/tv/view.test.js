import { describe, expect, it } from 'vitest'
import {
  TV_RANGES, ageLabel, nextSort, pickHeadlines, rowView, sessionLabel, sortSymbols, sparkPath, stepRange,
} from '../../tv/lib/view.js'

describe('rowView', () => {
  it('returns a placeholder row before the first quote lands', () => {
    expect(rowView(null)).toEqual({ ready: false, dir: 'flat', ext: null, spark: [] })
  })

  it('derives direction from the day change', () => {
    const up = rowView({ quote: { price: 10, change: 1, pct: 11.1, name: 'Up Co' } })
    expect(up.dir).toBe('up')
    expect(up.name).toBe('Up Co')
    expect(rowView({ quote: { price: 10, change: -1, pct: -9 } }).dir).toBe('down')
    expect(rowView({ quote: { price: 10, change: 0, pct: 0 } }).dir).toBe('flat')
  })

  it('carries an extended-hours print with its own direction', () => {
    const v = rowView({ quote: { price: 10, change: 1, pct: 1, extLabel: 'AH', extPrice: 9.5, extPct: -5 } })
    expect(v.ext).toEqual({ label: 'AH', price: 9.5, pct: -5, dir: 'down' })
  })

  it('takes the last month of daily closes for the spark', () => {
    // feed.js stores histo in badges.histoBars' compact shape
    const histo = Array.from({ length: 40 }, (_, i) => ({ v: 1, up: true, c: i, h: i, l: i }))
    const v = rowView({ quote: { price: 1, change: 0, pct: 0 }, histo })
    expect(v.spark).toHaveLength(22)
    expect(v.spark[0]).toBe(18)
    expect(v.spark[21]).toBe(39)
  })
})

describe('sparkPath', () => {
  it('draws nothing for fewer than two points', () => {
    expect(sparkPath([1], 100, 20)).toBe('')
  })

  it('spans the full box with the high at the top', () => {
    expect(sparkPath([0, 10], 100, 20)).toBe('M0.0 20.0L100.0 0.0')
  })

  it('draws a flat series through the middle', () => {
    expect(sparkPath([5, 5, 5], 100, 20)).toBe('M0.0 10.0L50.0 10.0L100.0 10.0')
  })
})

describe('board sort', () => {
  const pct = { AAPL: 1, MSFT: -2, TSLA: 5, XOM: null }
  const quoteOf = (s) => (pct[s] == null ? null : { pct: pct[s] })

  it('keeps list order in list mode', () => {
    expect(sortSymbols(['AAPL', 'MSFT', 'TSLA'], quoteOf, 'list')).toEqual(['AAPL', 'MSFT', 'TSLA'])
  })

  it('ranks gainers first with unquoted symbols last', () => {
    expect(sortSymbols(['XOM', 'AAPL', 'MSFT', 'TSLA'], quoteOf, 'gainers')).toEqual(['TSLA', 'AAPL', 'MSFT', 'XOM'])
  })

  it('ranks losers first with unquoted symbols last', () => {
    expect(sortSymbols(['XOM', 'AAPL', 'MSFT', 'TSLA'], quoteOf, 'losers')).toEqual(['MSFT', 'AAPL', 'TSLA', 'XOM'])
  })

  it('cycles list, gainers, losers', () => {
    expect(nextSort('list')).toBe('gainers')
    expect(nextSort('gainers')).toBe('losers')
    expect(nextSort('losers')).toBe('list')
  })
})

describe('chart ranges', () => {
  it('offers only keys the shared history client knows', () => {
    expect(TV_RANGES).toEqual(['2D', '5D', '1M', '6M', '1Y', '5Y'])
  })

  it('steps without wrapping', () => {
    expect(stepRange('1M', 1)).toBe('6M')
    expect(stepRange('5Y', 1)).toBe('5Y')
    expect(stepRange('2D', -1)).toBe('2D')
    expect(stepRange('nope', 1)).toBe('1M')
  })
})

describe('sessionLabel', () => {
  it('names each session in plain words', () => {
    expect(sessionLabel({ state: 'pre' })).toBe('Pre-market')
    expect(sessionLabel({ state: 'open' })).toBe('Market open')
    expect(sessionLabel({ state: 'post' })).toBe('After hours')
    expect(sessionLabel({ state: 'closed' })).toBe('Market closed')
  })

  it('names the holiday when the market is shut for one', () => {
    expect(sessionLabel({ state: 'closed', holiday: 'Thanksgiving' })).toBe('Closed for Thanksgiving')
  })
})

describe('wire headlines', () => {
  const now = 10_000
  const ev = (id, headline, ts, extra = {}) => ({
    id, type: 'headline', headline, ts, ts_event: ts, ts_seen: ts, url: 'https://reuters.com/x', ...extra,
  })

  it('keeps headlines newest first and drops repeats', () => {
    const out = pickHeadlines([
      ev(1, 'Old story', now - 600),
      ev(2, 'New story', now - 60),
      ev(3, 'New story', now - 30),
    ], now, 5)
    expect(out.map((e) => e.headline)).toEqual(['New story', 'Old story'])
  })

  it('drops low-credibility sources and non-headline events', () => {
    const out = pickHeadlines([
      ev(1, 'Mill take', now, { url: 'https://www.fool.com/a' }),
      ev(2, 'Price move', now, { type: 'price' }),
      ev(3, 'Wire story', now),
    ], now, 5)
    expect(out.map((e) => e.headline)).toEqual(['Wire story'])
  })

  it('places a future-stamped story at the time the wire saw it', () => {
    const out = pickHeadlines([
      ev(1, 'Fresh story', now - 120),
      ev(2, 'Misdated story', now + 40_000, { ts_seen: now - 900 }),
    ], now, 5)
    expect(out.map((e) => e.headline)).toEqual(['Fresh story', 'Misdated story'])
    expect(out[1].at).toBe(now - 900)
  })

  it('limits the count', () => {
    const many = Array.from({ length: 12 }, (_, i) => ev(i, `Story ${i}`, now - i))
    expect(pickHeadlines(many, now, 4)).toHaveLength(4)
  })

  it('labels ages in minutes, hours and days', () => {
    expect(ageLabel(now - 30, now)).toBe('now')
    expect(ageLabel(now - 300, now)).toBe('5m')
    expect(ageLabel(now - 7200, now)).toBe('2h')
    expect(ageLabel(now - 3 * 86400, now)).toBe('3d')
  })
})
