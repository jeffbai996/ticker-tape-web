import { describe, expect, it } from 'vitest'
import {
  FEED_DELAYED_MS, SNAPSHOT_LIVE_MS, SYMBOL_STALE_MS,
  feedHealth, fmtAge, freshnessTitle, isLiveSource, symbolFreshness,
} from '../../src/lib/feedHealth.js'
import { hasLabelTranslation, setLocale, t } from '../../src/lib/i18n.js'

const NOW = 1_700_000_000_000

describe('feedHealth', () => {
  it('reads LIVE when the socket is up and a snapshot landed this sweep', () => {
    const h = feedHealth({
      streamConnected: true,
      lastStreamTs: NOW - 2_000,
      lastSnapshotTs: NOW - 20_000,
    }, NOW)
    expect(h.state).toBe('live')
    expect(h.label).toBe('LIVE')
    expect(h.ageLabel).toBe('')
  })

  // a dropped socket is not a dead feed: the 30s v7 sweep still prices the
  // board, so the row is RECOVERING, never LIVE and never DELAYED
  it('reads RECOVERING while the socket is down but snapshots still land', () => {
    const h = feedHealth({
      streamConnected: false,
      lastStreamTs: NOW - 40_000,
      lastSnapshotTs: NOW - 10_000,
    }, NOW)
    expect(h.state).toBe('recovering')
    expect(h.ageLabel).toBe('10s')
    expect(h.label).toBe('RECOVERING 10s')
  })

  it('reads RECOVERING when the socket is up but the sweep is late', () => {
    const h = feedHealth({
      streamConnected: true,
      lastStreamTs: NOW - SNAPSHOT_LIVE_MS - 1,
      lastSnapshotTs: NOW - SNAPSHOT_LIVE_MS - 1,
    }, NOW)
    expect(h.state).toBe('recovering')
  })

  it('reads DELAYED once nothing has arrived for the stale window', () => {
    const h = feedHealth({
      streamConnected: true,
      lastStreamTs: NOW - FEED_DELAYED_MS,
      lastSnapshotTs: NOW - FEED_DELAYED_MS,
    }, NOW)
    expect(h.state).toBe('delayed')
    expect(h.label).toBe('DELAYED 5m')
    expect(h.ageMs).toBe(FEED_DELAYED_MS)
  })

  // a live stream tick is data, whatever the REST sweep is doing
  it('lets a fresh stream tick hold the feed out of DELAYED', () => {
    const h = feedHealth({
      streamConnected: true,
      lastStreamTs: NOW - 3_000,
      lastSnapshotTs: NOW - 10 * FEED_DELAYED_MS,
    }, NOW)
    expect(h.state).toBe('recovering')
    expect(h.ageMs).toBe(3_000)
  })

  it('waits rather than crying DELAYED before the first quote', () => {
    const h = feedHealth({ streamConnected: false, lastStreamTs: 0, lastSnapshotTs: 0 }, NOW)
    expect(h.state).toBe('recovering')
    expect(h.ageMs).toBe(null)
    expect(h.label).toBe('RECOVERING')
  })

  // The tooltip has to survive translation, so it is a key plus params rather
  // than a sentence with the age already baked into it — a built string can
  // only ever be shown in English.
  it('always explains itself with a translatable tooltip', () => {
    for (const input of [
      { streamConnected: true, lastStreamTs: NOW, lastSnapshotTs: NOW },
      { streamConnected: true, lastStreamTs: NOW, lastSnapshotTs: NOW - 2 * SNAPSHOT_LIVE_MS },
      { streamConnected: false, lastStreamTs: NOW - 1_000, lastSnapshotTs: NOW - 1_000 },
      { streamConnected: false, lastStreamTs: 0, lastSnapshotTs: NOW - FEED_DELAYED_MS },
      { streamConnected: false, lastStreamTs: 0, lastSnapshotTs: 0 },
    ]) {
      const h = feedHealth(input, NOW)
      expect(h.titleKey).toMatch(/^feed\./)
      setLocale('en')
      const en = t(h.titleKey, h.titleParams)
      expect(en.length).toBeGreaterThan(0)
      expect(en).not.toBe(h.titleKey)          // an unknown key echoes itself
      setLocale('zh')
      const zh = t(h.titleKey, h.titleParams)
      expect(zh).toMatch(/[一-鿿]/)
      if (h.titleParams?.age) expect(zh).toContain(h.titleParams.age)
      setLocale('en')
    }
  })

  it('gives every state word a translation of its own', () => {
    for (const state of ['live', 'recovering', 'delayed']) {
      expect(hasLabelTranslation(state.toUpperCase())).toBe(true)
    }
  })
})

describe('symbolFreshness', () => {
  it('names the stream when its tick is the newest thing on the row', () => {
    const f = symbolFreshness({ streamTs: NOW - 1_000, snapshotTs: NOW - 20_000 }, NOW)
    expect(f.source).toBe('stream')
    expect(f.receivedAt).toBe(NOW - 1_000)
    expect(f.ageMs).toBe(1_000)
  })

  // the whole point: a snapshot row must never be dressed up as live
  it('names the snapshot when the socket has not printed since', () => {
    const f = symbolFreshness({ streamTs: NOW - 60_000, snapshotTs: NOW - 5_000 }, NOW)
    expect(f.source).toBe('snapshot')
    expect(isLiveSource(f.source)).toBe(false)
  })

  it('names the overnight book when the sidecar filled last', () => {
    const f = symbolFreshness({
      streamTs: NOW - 90_000, snapshotTs: NOW - 40_000, overnightTs: NOW - 2_000,
    }, NOW)
    expect(f.source).toBe('overnight')
  })

  it('goes stale once every clock is past the stale window', () => {
    const f = symbolFreshness({ streamTs: NOW - SYMBOL_STALE_MS, snapshotTs: 0 }, NOW)
    expect(f.source).toBe('stale')
    expect(f.receivedAt).toBe(NOW - SYMBOL_STALE_MS)
  })

  it('reports stale with no timestamp for a symbol that never landed', () => {
    for (const entry of [null, undefined, {}, { streamTs: 0, snapshotTs: 0 }]) {
      const f = symbolFreshness(entry, NOW)
      expect(f.source).toBe('stale')
      expect(f.receivedAt).toBe(null)
      expect(f.ageMs).toBe(null)
    }
  })

  it('treats only the live stream as live', () => {
    expect(isLiveSource('stream')).toBe(true)
    expect(['snapshot', 'overnight', 'stale'].some(isLiveSource)).toBe(false)
  })
})

describe('freshness copy', () => {
  it('spells the age in one glanceable unit', () => {
    expect(fmtAge(0)).toBe('0s')
    expect(fmtAge(45_000)).toBe('45s')
    expect(fmtAge(90_000)).toBe('1m')
    expect(fmtAge(3 * 3_600_000)).toBe('3h')
    expect(fmtAge(null)).toBe('')
  })

  it('says the source and the age in the row tooltip', () => {
    expect(freshnessTitle(symbolFreshness({ streamTs: NOW - 3_000 }, NOW)))
      .toBe('live stream · 3s ago')
    expect(freshnessTitle(symbolFreshness({ snapshotTs: NOW - 30_000 }, NOW)))
      .toBe('snapshot · 30s ago')
    expect(freshnessTitle(symbolFreshness({ overnightTs: NOW - 60_000 }, NOW)))
      .toBe('overnight book · 1m ago')
    expect(freshnessTitle(symbolFreshness({ streamTs: NOW - 10 * SYMBOL_STALE_MS }, NOW)))
      .toMatch(/^stale/)
    expect(freshnessTitle(symbolFreshness(null, NOW))).toBe('no quote yet')
  })
})
