import { describe, it, expect } from 'vitest'
import {
  BOTTOM_EPSILON,
  captureAnchor,
  restoreAnchor,
  restoredScrollTop,
} from '../../src/lib/scrollAnchor.js'

/** jsdom performs no layout, so a plain object stands in for the scroller.
 *  The anchor math only ever reads these three numbers. */
const scroller = (scrollHeight, scrollTop, clientHeight) => ({
  scrollHeight,
  scrollTop,
  clientHeight,
})

describe('captureAnchor', () => {
  it('reports pinned when the reader sits at the bottom', () => {
    expect(captureAnchor(scroller(3000, 2400, 600)).atBottom).toBe(true)
  })

  it('reports not pinned once the reader scrolls up', () => {
    expect(captureAnchor(scroller(3000, 1900, 600)).atBottom).toBe(false)
  })

  it('treats a gap just inside the epsilon as pinned, and the epsilon itself as not', () => {
    const inside = 3000 - 600 - (BOTTOM_EPSILON - 1)
    const at = 3000 - 600 - BOTTOM_EPSILON
    expect(captureAnchor(scroller(3000, inside, 600)).atBottom).toBe(true)
    expect(captureAnchor(scroller(3000, at, 600)).atBottom).toBe(false)
  })

  it('records distance from the bottom, not from the top', () => {
    expect(captureAnchor(scroller(3000, 1900, 600)).fromBottom).toBe(1100)
  })

  it('returns null when there is no element', () => {
    expect(captureAnchor(null)).toBe(null)
  })
})

describe('restoredScrollTop', () => {
  it('keeps a pinned reader at the tail when zooming in grows the transcript', () => {
    const anchor = captureAnchor(scroller(3000, 2400, 600))
    expect(restoredScrollTop(anchor, 3300)).toBe(3300)
  })

  it('keeps a pinned reader at the tail when zooming out shrinks it', () => {
    const anchor = captureAnchor(scroller(3000, 2400, 600))
    expect(restoredScrollTop(anchor, 2700)).toBe(2700)
  })

  it('holds distance from the bottom when zooming in', () => {
    const anchor = captureAnchor(scroller(3000, 1900, 600))
    expect(restoredScrollTop(anchor, 3300)).toBe(2200)
  })

  it('holds distance from the bottom when zooming out', () => {
    const anchor = captureAnchor(scroller(3000, 1900, 600))
    expect(restoredScrollTop(anchor, 2700)).toBe(1600)
  })

  it('never returns a negative scrollTop when the transcript shrinks past the anchor', () => {
    const anchor = captureAnchor(scroller(3000, 1900, 600))
    expect(restoredScrollTop(anchor, 800)).toBe(0)
  })

  it('returns null for a missing anchor', () => {
    expect(restoredScrollTop(null, 3300)).toBe(null)
  })
})

describe('the regression this exists to prevent', () => {
  // Zooming in 10% grows a 3000px transcript to 3300px. The reader is parked
  // 500px above the bottom. Leaving scrollTop alone — the old behaviour —
  // silently moves them 300px; the anchor puts them back exactly where they were.
  const before = scroller(3000, 1900, 600)
  const grown = 3300
  const gap = (scrollHeight, scrollTop) => scrollHeight - scrollTop - before.clientHeight

  it('the old behaviour (hold scrollTop) drifts the reader', () => {
    expect(gap(before.scrollHeight, before.scrollTop)).toBe(500)
    expect(gap(grown, before.scrollTop)).toBe(800)
  })

  it('the anchor holds the reader still', () => {
    const restored = restoredScrollTop(captureAnchor(before), grown)
    expect(gap(grown, restored)).toBe(500)
  })
})

describe('restoreAnchor', () => {
  it('writes the restored position onto the element', () => {
    const el = scroller(3000, 1900, 600)
    const anchor = captureAnchor(el)
    el.scrollHeight = 3300 // the reflow
    restoreAnchor(el, anchor)
    expect(el.scrollTop).toBe(2200)
  })

  it('is a no-op without an element or an anchor', () => {
    expect(() => restoreAnchor(null, { atBottom: true, fromBottom: 0 })).not.toThrow()
    const el = scroller(3000, 1900, 600)
    restoreAnchor(el, null)
    expect(el.scrollTop).toBe(1900)
  })
})
