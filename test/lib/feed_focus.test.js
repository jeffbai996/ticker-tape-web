// On-screen-first data: a surface declares which of its tracked symbols the
// user is actually looking at, and the feed spends its request budget there
// first. Everything the ordering and cadence rules do is a pure function, so
// the numbers below ARE the spec — feed.js only consumes them.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  FOCUS_MAX, createFeedSymbolRegistry, nextPumpIndex, orderFocusedFirst,
} from '../../src/lib/feedSymbols.js'
import {
  FOCUS_SWEEP_GRACE_MS, fastSweepIntervalMs, focus, quoteAgeMs, shouldFastSweep,
  staleFocusSymbols, sweepIntervalMs,
} from '../../src/lib/feed.js'
import { useFocusedSymbols } from '../../src/hooks.js'

const board = (n) => Array.from({ length: n }, (_, i) => `SYM${String(i).padStart(2, '0')}`)

describe('focus registry', () => {
  it('hands back a release function and reports the newest surface first', () => {
    const registry = createFeedSymbolRegistry()
    registry.retain(['AAPL', 'MSFT', 'GOOGL', 'AMZN'])
    const rows = registry.focus(['AAPL', 'MSFT'])
    const research = registry.focus(['AMZN'])

    expect(registry.focused()).toEqual(['AMZN', 'AAPL', 'MSFT'])
    research()
    expect(registry.focused()).toEqual(['AAPL', 'MSFT'])
    rows()
    expect(registry.focused()).toEqual([])
    rows() // releasing twice is a no-op, like retain()
    expect(registry.focused()).toEqual([])
  })

  it('dedupes overlapping surfaces and caps the set at one v7 chunk', () => {
    const registry = createFeedSymbolRegistry()
    registry.focus(['AAPL', 'MSFT', 'AAPL', '', null])
    registry.focus(['MSFT', 'GOOGL'])
    expect(registry.focused()).toEqual(['MSFT', 'GOOGL', 'AAPL'])

    const wide = createFeedSymbolRegistry()
    wide.focus(board(90))
    expect(FOCUS_MAX).toBe(40) // the v7 chunk size: a focus set is one request
    expect(wide.focused()).toHaveLength(FOCUS_MAX)
    expect(wide.focused()[0]).toBe('SYM00')
  })

  it('orders tracked symbols focus-first without changing membership', () => {
    const registry = createFeedSymbolRegistry()
    registry.retain(['AAPL', 'MSFT', 'GOOGL'])
    registry.persist(['ALRT'])
    const release = registry.focus(['GOOGL', 'TSLA']) // TSLA is not tracked

    expect(registry.values()).toEqual(['GOOGL', 'AAPL', 'MSFT', 'ALRT'])
    release()
    expect(registry.values()).toEqual(['AAPL', 'MSFT', 'GOOGL', 'ALRT'])
  })

  it('leaves a registry with no focus behaving exactly as before', () => {
    const registry = createFeedSymbolRegistry()
    const releaseMain = registry.retain(['AAPL', 'MSFT'])
    registry.retain(['TSLA', 'AMZN'])
    registry.persist(['ALRT'])
    expect(registry.values()).toEqual(['TSLA', 'AMZN', 'AAPL', 'MSFT', 'ALRT'])
    expect(registry.focused()).toEqual([])
    releaseMain()
    expect(registry.values()).toEqual(['TSLA', 'AMZN', 'ALRT'])
  })
})

describe('orderFocusedFirst', () => {
  it('puts every visible row in the first chunk of a 60-symbol board', () => {
    const all = board(60)
    const visible = all.slice(44, 56) // a scrolled-down viewport: rows 44..55
    const ordered = orderFocusedFirst(all, visible)

    expect(ordered.slice(0, 12)).toEqual(visible)
    expect(ordered).toHaveLength(60)
    expect([...ordered].sort()).toEqual([...all].sort()) // membership untouched
    const firstChunk = ordered.slice(0, 40)
    for (const symbol of visible) expect(firstChunk).toContain(symbol)
  })

  it('dedupes, drops untracked focus, and is identity with no focus', () => {
    const all = ['AAPL', 'MSFT', 'GOOGL', 'AAPL']
    expect(orderFocusedFirst(all, [])).toEqual(['AAPL', 'MSFT', 'GOOGL'])
    expect(orderFocusedFirst(all, null)).toEqual(['AAPL', 'MSFT', 'GOOGL'])
    expect(orderFocusedFirst(all, ['GOOGL', 'TSLA', 'GOOGL']))
      .toEqual(['GOOGL', 'AAPL', 'MSFT'])
  })
})

describe('nextPumpIndex — the chart pump dequeues what is on screen', () => {
  it('takes the first focused symbol out of the middle of the queue', () => {
    const queue = ['AAPL', 'MSFT', 'GOOGL', 'AMZN']
    expect(nextPumpIndex(queue, ['AMZN', 'GOOGL'])).toBe(2) // queue order breaks the tie
    expect(nextPumpIndex(queue, new Set(['AMZN']))).toBe(3)
  })

  it('falls back to the head when nothing focused is queued', () => {
    const queue = ['AAPL', 'MSFT']
    expect(nextPumpIndex(queue, [])).toBe(0)
    expect(nextPumpIndex(queue, ['TSLA'])).toBe(0)
    expect(nextPumpIndex([], ['AAPL'])).toBe(-1)
  })

  it('never displaces the pinned RS benchmark at the head of the queue', () => {
    // badge rows diff against the benchmark; jumping it would paint the first
    // focused rows with no RS at all
    expect(nextPumpIndex(['QQQ', 'AAPL', 'MSFT'], ['MSFT'], 'QQQ')).toBe(0)
    expect(nextPumpIndex(['AAPL', 'QQQ', 'MSFT'], ['MSFT'], 'QQQ')).toBe(2)
  })
})

describe('fast-sweep cadence', () => {
  it('only exists while something is printing, and stays under the full sweep', () => {
    expect(fastSweepIntervalMs('open')).toBe(10_000)
    expect(fastSweepIntervalMs('pre')).toBe(10_000)
    expect(fastSweepIntervalMs('post')).toBe(10_000)
    expect(fastSweepIntervalMs('closed')).toBe(0) // includes overnight: no extra leg
    for (const state of ['open', 'pre', 'post']) {
      expect(fastSweepIntervalMs(state)).toBeLessThan(sweepIntervalMs(state))
    }
  })

  it('skips the extra request when it would be waste', () => {
    const live = {
      intervalMs: fastSweepIntervalMs('open'),
      focusedCount: 12,
      hidden: false,
      sinceFullSweepMs: 10_000,
    }
    expect(shouldFastSweep(live)).toBe(true)
    expect(shouldFastSweep({ ...live, hidden: true })).toBe(false)
    expect(shouldFastSweep({ ...live, focusedCount: 0 })).toBe(false)
    expect(shouldFastSweep({ ...live, intervalMs: fastSweepIntervalMs('closed') })).toBe(false)
    expect(FOCUS_SWEEP_GRACE_MS).toBe(3_000)
    expect(shouldFastSweep({ ...live, sinceFullSweepMs: 2_999 })).toBe(false)
    expect(shouldFastSweep({ ...live, sinceFullSweepMs: 3_000 })).toBe(true)
  })
})

describe('scroll-in freshness', () => {
  it('ages a cache entry by its newest quote clock, never by the chart clock', () => {
    const now = 1_000_000
    expect(quoteAgeMs({ ts: now, streamTs: 0, snapshotTs: 0 }, now)).toBe(Infinity)
    expect(quoteAgeMs(null, now)).toBe(Infinity)
    expect(quoteAgeMs({ snapshotTs: now - 5_000, streamTs: now - 1_000 }, now)).toBe(1_000)
    expect(quoteAgeMs({ snapshotTs: now - 5_000, overnightTs: now - 200 }, now)).toBe(200)
  })

  it('requests only the entering rows whose quote is older than the sweep', () => {
    const now = 2_000_000
    const entries = {
      AAPL: { snapshotTs: now - 1_000 },   // covered by the last sweep
      MSFT: { snapshotTs: now - 45_000 },  // older than a 30s sweep
      GOOGL: null,                         // never fetched
    }
    const stale = staleFocusSymbols(
      ['AAPL', 'MSFT', 'GOOGL'], (s) => entries[s], sweepIntervalMs('open'), now,
    )
    expect(stale).toEqual(['MSFT', 'GOOGL'])
    // a slower session tolerates an older quote before spending a request
    expect(staleFocusSymbols(['MSFT'], (s) => entries[s], sweepIntervalMs('closed'), now))
      .toEqual([])
  })
})

describe('opt-in API for surfaces', () => {
  it('exposes useFocusedSymbols on top of feed.focus, with a release', () => {
    expect(typeof useFocusedSymbols).toBe('function')
    expect(typeof focus(['AAPL'])).toBe('function') // release, like follow()
    expect(typeof focus([])).toBe('function')       // an empty viewport is free
    const hooks = readFileSync('src/hooks.js', 'utf8')
    expect(hooks).toContain('export function useFocusedSymbols(symbols)')
    // the effect must return feed.focus's release, or a scrolled-away row
    // stays "on screen" forever
    expect(hooks).toMatch(/useEffect\(\(\) => \{[\s\S]*return focus\(/)
  })
})
