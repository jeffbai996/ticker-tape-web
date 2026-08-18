// What the board can honestly claim is on screen. IntersectionObserver hands
// over one entry per crossing, in whatever order the browser batched them and
// as often as a scroll wants to fire; the feed wants a DOM-ordered symbol list
// that changes only when the SET changes. That bookkeeping is pure — the hook
// only supplies the observer and the frame clock — so the numbers below are
// the spec for both.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { h, render } from 'preact'
import { useRef } from 'preact/hooks'
import { createInViewTracker } from '../../src/lib/inview.js'
import { useInViewSymbols } from '../../src/hooks.js'
import { FOCUS_MAX } from '../../src/lib/feedSymbols.js'

const source = (path) => readFileSync(resolve(process.cwd(), path), 'utf8')

/** A hand-cranked frame clock: nothing runs until the test says so, which is
 *  the only way to prove a burst of callbacks costs exactly one update. */
function manualFrames() {
  const queued = new Map()
  let next = 1
  return {
    schedule(fn) { const id = next++; queued.set(id, fn); return id },
    cancel(id) { queued.delete(id) },
    run() {
      const fns = [...queued.values()]
      queued.clear()
      for (const fn of fns) fn()
    },
    get pending() { return queued.size },
  }
}

const row = (symbol) => {
  const el = document.createElement('a')
  el.dataset.rowSymbol = symbol
  return el
}

const crossings = (entries) => entries.map(([target, isIntersecting]) => ({ target, isIntersecting }))

describe('in-view tracker — coalescing', () => {
  it('turns a burst of intersection callbacks into one update per frame', () => {
    const frames = manualFrames()
    const seen = []
    const rows = ['AAPL', 'MSFT', 'GOOGL'].map(row)
    const tracker = createInViewTracker({
      schedule: frames.schedule, cancel: frames.cancel, emit: (s) => seen.push(s),
    })
    tracker.setElements(rows)

    tracker.apply(crossings([[rows[0], true]]))
    tracker.apply(crossings([[rows[1], true]]))
    tracker.apply(crossings([[rows[2], true]]))
    expect(seen).toEqual([])      // nothing fires inline — a scroll is not a render
    expect(frames.pending).toBe(1) // one frame booked, whatever the burst size

    frames.run()
    expect(seen).toEqual([['AAPL', 'MSFT', 'GOOGL']])
  })

  it('reports rows in DOM order, not in the order the browser batched them', () => {
    const frames = manualFrames()
    const seen = []
    const rows = ['AAPL', 'MSFT', 'GOOGL', 'AMZN'].map(row)
    const tracker = createInViewTracker({
      schedule: frames.schedule, cancel: frames.cancel, emit: (s) => seen.push(s),
    })
    tracker.setElements(rows)
    tracker.apply(crossings([[rows[3], true], [rows[1], true], [rows[2], true]]))
    frames.run()
    expect(seen).toEqual([['MSFT', 'GOOGL', 'AMZN']])
  })

  it('caps what it declares at one v7 request', () => {
    const frames = manualFrames()
    const seen = []
    const rows = Array.from({ length: FOCUS_MAX + 12 }, (_, i) => row(`SYM${String(i).padStart(2, '0')}`))
    const tracker = createInViewTracker({
      schedule: frames.schedule, cancel: frames.cancel, emit: (s) => seen.push(s), max: FOCUS_MAX,
    })
    tracker.setElements(rows)
    tracker.apply(crossings(rows.map((el) => [el, true])))
    frames.run()
    expect(seen[0]).toHaveLength(FOCUS_MAX)
    expect(seen[0][0]).toBe('SYM00')
  })
})

describe('in-view tracker — silence when nothing changed', () => {
  it('never emits for a viewport whose set is unchanged', () => {
    const frames = manualFrames()
    const seen = []
    const rows = ['AAPL', 'MSFT', 'GOOGL'].map(row)
    const tracker = createInViewTracker({
      schedule: frames.schedule, cancel: frames.cancel, emit: (s) => seen.push(s),
    })
    tracker.setElements(rows)
    tracker.apply(crossings([[rows[0], true], [rows[1], true]]))
    frames.run()
    expect(seen).toHaveLength(1)

    // scrolling a few pixels re-delivers the same rows: no update, no render
    tracker.apply(crossings([[rows[0], true], [rows[1], true]]))
    frames.run()
    tracker.apply(crossings([[rows[1], true]]))
    frames.run()
    expect(seen).toHaveLength(1)
  })

  it('starts silent — an empty viewport is the state the caller already has', () => {
    const frames = manualFrames()
    const seen = []
    const tracker = createInViewTracker({
      schedule: frames.schedule, cancel: frames.cancel, emit: (s) => seen.push(s),
    })
    tracker.setElements(['AAPL', 'MSFT'].map(row))
    frames.run()
    expect(seen).toEqual([])
  })

  it('emits when one row leaves and another arrives', () => {
    const frames = manualFrames()
    const seen = []
    const rows = ['AAPL', 'MSFT', 'GOOGL'].map(row)
    const tracker = createInViewTracker({
      schedule: frames.schedule, cancel: frames.cancel, emit: (s) => seen.push(s),
    })
    tracker.setElements(rows)
    tracker.apply(crossings([[rows[0], true], [rows[1], true]]))
    frames.run()
    tracker.apply(crossings([[rows[0], false], [rows[2], true]]))
    frames.run()
    expect(seen).toEqual([['AAPL', 'MSFT'], ['MSFT', 'GOOGL']])
  })
})

describe('in-view tracker — lifecycle', () => {
  it('forgets rows the board no longer renders', () => {
    const frames = manualFrames()
    const seen = []
    const rows = ['AAPL', 'MSFT', 'GOOGL'].map(row)
    const tracker = createInViewTracker({
      schedule: frames.schedule, cancel: frames.cancel, emit: (s) => seen.push(s),
    })
    tracker.setElements(rows)
    tracker.apply(crossings(rows.map((el) => [el, true])))
    frames.run()
    expect(seen.at(-1)).toEqual(['AAPL', 'MSFT', 'GOOGL'])

    tracker.setElements([rows[0], rows[2]]) // MSFT was filtered out of the board
    frames.run()
    expect(seen.at(-1)).toEqual(['AAPL', 'GOOGL'])
    expect(tracker.current()).toEqual(['AAPL', 'GOOGL'])
  })

  it('cancels the pending frame and goes quiet on dispose', () => {
    const frames = manualFrames()
    const seen = []
    const rows = ['AAPL', 'MSFT'].map(row)
    const tracker = createInViewTracker({
      schedule: frames.schedule, cancel: frames.cancel, emit: (s) => seen.push(s),
    })
    tracker.setElements(rows)
    tracker.apply(crossings([[rows[0], true]]))
    expect(frames.pending).toBe(1)

    tracker.dispose()
    expect(frames.pending).toBe(0)
    tracker.apply(crossings([[rows[1], true]])) // a late callback after unmount
    frames.run()
    expect(seen).toEqual([])
  })
})

// ── the hook ────────────────────────────────────────────────────────────────
// Preact flushes effects after paint, via rAF where the host has one; jsdom
// has neither rAF nor IntersectionObserver, so both are installed here (the
// rAF trick is test/lib/lazy_chart.test.js's).

class FakeObserver {
  static instances = []

  constructor(cb, options) {
    this.cb = cb
    this.options = options
    this.targets = []
    this.disconnected = false
    FakeObserver.instances.push(this)
  }

  observe(el) { this.targets.push(el) }
  unobserve(el) { this.targets = this.targets.filter((t) => t !== el) }
  disconnect() { this.disconnected = true; this.targets = [] }

  /** Deliver a crossing for every observed row: on screen iff `visible` says so. */
  fire(visible) {
    const wanted = new Set(visible)
    this.cb(this.targets.map((target) => ({
      target, isIntersecting: wanted.has(target.dataset.rowSymbol),
    })), this)
  }
}

let container = null
let renders = 0
let latest = []

function Board({ rows, mode = 'flat' }) {
  renders += 1
  const boardRef = useRef(null)
  latest = useInViewSymbols(boardRef, `${mode}:${rows.join(',')}`)
  return h('section', { ref: boardRef },
    rows.map((symbol) => h('a', { key: symbol, 'data-row-symbol': symbol }, symbol)))
}

const settle = async (ticks = 4) => {
  for (let i = 0; i < ticks; i += 1) await new Promise((r) => setTimeout(r, 0))
}

describe('useInViewSymbols', () => {
  beforeEach(() => {
    FakeObserver.instances = []
    renders = 0
    latest = []
    globalThis.IntersectionObserver = FakeObserver
    globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0)
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    render(null, container)
    container.remove()
    delete globalThis.IntersectionObserver
    delete globalThis.requestAnimationFrame
    delete globalThis.cancelAnimationFrame
  })

  it('observes every rendered row and reports the ones on screen', async () => {
    render(h(Board, { rows: ['AAPL', 'MSFT', 'GOOGL', 'AMZN'] }), container)
    await settle()
    const io = FakeObserver.instances[0]
    expect(io.targets.map((el) => el.dataset.rowSymbol))
      .toEqual(['AAPL', 'MSFT', 'GOOGL', 'AMZN'])

    io.fire(['MSFT', 'GOOGL'])
    await settle()
    expect(latest).toEqual(['MSFT', 'GOOGL'])
  })

  it('does not re-render the board while the visible set is unchanged', async () => {
    render(h(Board, { rows: ['AAPL', 'MSFT', 'GOOGL'] }), container)
    await settle()
    const io = FakeObserver.instances[0]
    io.fire(['AAPL', 'MSFT'])
    await settle()
    const after = renders
    expect(latest).toEqual(['AAPL', 'MSFT'])

    for (let i = 0; i < 5; i += 1) {
      io.fire(['AAPL', 'MSFT']) // five scroll frames inside the same two rows
      await settle()
    }
    expect(renders).toBe(after)

    io.fire(['MSFT', 'GOOGL']) // a real change still lands
    await settle()
    expect(renders).toBe(after + 1)
    expect(latest).toEqual(['MSFT', 'GOOGL'])
  })

  it('re-observes when the rendered rows change, dropping the old observer', async () => {
    render(h(Board, { rows: ['AAPL', 'MSFT'] }), container)
    await settle()
    expect(FakeObserver.instances).toHaveLength(1)

    render(h(Board, { rows: ['AAPL', 'MSFT', 'TSLA'] }), container)
    await settle()
    expect(FakeObserver.instances).toHaveLength(2)
    expect(FakeObserver.instances[0].disconnected).toBe(true)
    expect(FakeObserver.instances[1].targets.map((el) => el.dataset.rowSymbol))
      .toEqual(['AAPL', 'MSFT', 'TSLA'])

    FakeObserver.instances[1].fire(['TSLA'])
    await settle()
    expect(latest).toEqual(['TSLA'])
  })

  it('disconnects on unmount and ignores a late callback', async () => {
    render(h(Board, { rows: ['AAPL', 'MSFT'] }), container)
    await settle()
    const io = FakeObserver.instances[0]
    io.fire(['AAPL'])
    await settle()
    const after = renders

    const targets = [...io.targets]
    render(null, container)
    await settle()
    expect(io.disconnected).toBe(true)

    // a browser can still deliver one batch after disconnect()
    io.cb(targets.map((target) => ({ target, isIntersecting: true })), io)
    await settle()
    expect(renders).toBe(after)
  })

  it('declares nothing where there is no observer to see with', async () => {
    delete globalThis.IntersectionObserver
    render(h(Board, { rows: ['AAPL', 'MSFT'] }), container)
    await settle()
    // Focus is a claim that the user is LOOKING at these rows. With no
    // observer there is no evidence for that claim, and inventing "the whole
    // board" would buy a permanent extra sweep leg on a guess — so the board
    // behaves exactly as it did before focus existed.
    expect(latest).toEqual([])
  })

  it('caps a tall viewport at one v7 request', async () => {
    const rows = Array.from({ length: FOCUS_MAX + 15 }, (_, i) => `SYM${String(i).padStart(2, '0')}`)
    render(h(Board, { rows }), container)
    await settle()
    FakeObserver.instances[0].fire(rows)
    await settle()
    expect(latest).toHaveLength(FOCUS_MAX)
    expect(latest[0]).toBe('SYM00')
  })
})

describe('the surfaces that declare what is on screen', () => {
  const dashboard = source('src/pages/dashboard.jsx')
  const research = source('src/pages/research.jsx')

  it('wires the board through the viewport hook into feed focus', () => {
    expect(dashboard).toContain('useInViewSymbols')
    expect(dashboard).toContain('useFocusedSymbols(onScreen)')
    // the rows the observer binds to are the rows the board rendered — both
    // view modes, and re-bound when a group folds or the filter narrows
    expect(dashboard).toMatch(/renderedRows[\s\S]{0,400}viewMode === 'flat'/)
    expect(dashboard).toMatch(/useInViewSymbols\(boardRef,[^)]*viewMode/)
    expect(dashboard).toContain('data-row-symbol={symbol}')
  })

  it('focuses the research symbol without an observer at all', () => {
    // the open symbol IS the viewport on that page
    expect(research).toMatch(/useFocusedSymbols\(symbol \? \[symbol\] : \[\]\)/)
    expect(research).not.toContain('IntersectionObserver')
  })

  it('keeps the observer out of the row component', () => {
    // one observer for the board, not one per row — the row stays a pure
    // function of its quote
    expect(dashboard.match(/new IntersectionObserver/g)).toBe(null)
  })
})
