/** Snappiness without more load (Jeff 2026-08-18): the batch print must never
 *  come back from the browser's HTTP cache, the sweep follows the session,
 *  and a returning tab reconnects the socket now instead of after backoff. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sweepIntervalMs } from '../../src/lib/feed.js'
import { quoteCacheControl } from '../../worker/worker.js'

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('sweep cadence follows the tape', () => {
  it('is fastest when the ext print is the number and slowest when nothing prints', () => {
    expect(sweepIntervalMs('pre')).toBe(15_000)
    expect(sweepIntervalMs('post')).toBe(15_000)
    expect(sweepIntervalMs('open')).toBe(30_000)          // the stream carries the board
    expect(sweepIntervalMs('closed', true)).toBe(30_000)  // overnight: sidecar leg unchanged
    expect(sweepIntervalMs('closed', false)).toBe(120_000)
  })
  it('the sweep is self-rescheduling and refreshes charts on the 60s clock', () => {
    const feed = src('src/lib/feed.js')
    expect(feed).toContain('sweepIntervalMs(marketState().state, isOvernight())')
    expect(feed).toContain('sinceCharts >= REFRESH_MS')
    expect(feed).not.toContain('setInterval(() => {\n      scheduleBatch([...tracked])')
  })
})

describe('the batch print is never a cached artefact', () => {
  it('worker: v7 quote is no-store, everything else keeps its 30s', () => {
    expect(quoteCacheControl('/v7/finance/quote')).toBe('no-store')
    expect(quoteCacheControl('/v10/finance/quoteSummary/AAPL')).toBe('public, max-age=30')
    expect(quoteCacheControl('/v8/finance/chart/AAPL')).toBe('public, max-age=30')
  })
  it('client: the batch fetch opts out of the HTTP cache too', () => {
    const feed = src('src/lib/feed.js')
    const batch = feed.slice(feed.indexOf('async function runBatch'), feed.indexOf('const tracked = new Set()'))
    expect(batch).toContain("cache: 'no-store'")
  })
})

describe('the sweep legs stop when nothing is tracked', () => {
  it('takes both timers down with the last surface, and puts them back', () => {
    const feed = src('src/lib/feed.js')
    // a永-running sweep would wake a buried tab forever to refresh an empty set
    expect(feed).toContain('function stopSweeps()')
    expect(feed).toContain('if (!tracked.size) stopSweeps()')
    // both legs, not just the full sweep the audit already knew about
    const stop = feed.slice(feed.indexOf('function stopSweeps()'),
      feed.indexOf('function syncTracked()'))
    expect(stop).toContain('sweepTimer = null')
    expect(stop).toContain('fastTimer = null')
    // …and activate() re-arms both behind the same guard
    expect(feed).toContain('if (!sweepTimer) {')
    expect(feed).toContain('fastBeat()')
  })
})

describe('a returning tab wakes the whole feed', () => {
  it('nudges the socket and re-sweeps on visibility and on online', () => {
    const feed = src('src/lib/feed.js')
    expect(feed).toContain('liveStream?.nudge?.()')
    expect(feed).toContain("addEventListener?.('online', wake)")
    expect(feed).toContain("document.addEventListener('visibilitychange'")
  })
})
