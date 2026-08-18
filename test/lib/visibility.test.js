/** One document listener for the whole board.
 *
 *  The idle-CPU probe counted ~1220 live JS listeners on the dashboard: every
 *  flashing number registered its own `visibilitychange` handler, so a board
 *  of 37 rows × a dozen metrics each paid a listener per cell. They all want
 *  the same event at the same moment — one hub, many subscribers.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createVisibilityHub } from '../../src/lib/visibility.js'

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

function fakeDoc() {
  const listeners = new Map()
  return {
    hidden: false,
    added: 0,
    removed: 0,
    addEventListener(type, fn) { this.added++; listeners.set(type, fn) },
    removeEventListener(type) { this.removed++; listeners.delete(type) },
    fire(type = 'visibilitychange') { listeners.get(type)?.() },
    get live() { return listeners.size },
  }
}

describe('createVisibilityHub', () => {
  it('registers exactly one document listener no matter how many subscribe', () => {
    const doc = fakeDoc()
    const hub = createVisibilityHub(doc)
    const a = vi.fn(); const b = vi.fn(); const c = vi.fn()
    hub.subscribe(a); hub.subscribe(b); hub.subscribe(c)
    expect(doc.added).toBe(1)
    doc.fire()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
    expect(c).toHaveBeenCalledTimes(1)
  })

  it('passes the current hidden state so a subscriber needs no globals', () => {
    const doc = fakeDoc()
    const hub = createVisibilityHub(doc)
    const seen = []
    hub.subscribe((hidden) => seen.push(hidden))
    doc.fire()
    doc.hidden = true
    doc.fire()
    expect(seen).toEqual([false, true])
  })

  it('unsubscribes one without disturbing the rest, and drops the listener at zero', () => {
    const doc = fakeDoc()
    const hub = createVisibilityHub(doc)
    const a = vi.fn(); const b = vi.fn()
    const offA = hub.subscribe(a)
    const offB = hub.subscribe(b)
    offA()
    doc.fire()
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    expect(doc.removed).toBe(0)          // still one subscriber left
    offB()
    expect(doc.removed).toBe(1)
    expect(doc.live).toBe(0)
    offB()                               // idempotent
    expect(doc.removed).toBe(1)
  })

  it('re-arms the listener when a subscriber arrives after the last one left', () => {
    const doc = fakeDoc()
    const hub = createVisibilityHub(doc)
    hub.subscribe(vi.fn())()
    const back = vi.fn()
    hub.subscribe(back)
    expect(doc.added).toBe(2)
    doc.fire()
    expect(back).toHaveBeenCalledTimes(1)
  })

  it('survives a subscriber that throws, and a document that does not exist', () => {
    const doc = fakeDoc()
    const hub = createVisibilityHub(doc)
    const after = vi.fn()
    hub.subscribe(() => { throw new Error('bad cell') })
    hub.subscribe(after)
    expect(() => doc.fire()).not.toThrow()
    expect(after).toHaveBeenCalledTimes(1)
    const headless = createVisibilityHub(null)
    expect(typeof headless.subscribe(vi.fn())).toBe('function')
  })
})

describe('the surfaces that used to own a listener each', () => {
  it('flashing numbers share the hub instead of one listener per cell', () => {
    const fig = src('src/components/Fig.jsx')
    expect(fig).toContain("from '../lib/visibility.js'")
    expect(fig).not.toContain("addEventListener('visibilitychange'")
  })

  it('the feed chip ticks on a visible-only clock, not a background interval', () => {
    const chip = src('src/components/FeedIndicator.jsx')
    expect(chip).toContain('startVisibleClock')
    expect(chip).not.toContain('setInterval')
  })
})
