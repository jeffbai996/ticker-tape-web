import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { researchSource } from './researchSource.js'
import {
  TICK_FLASH_MS,
  createFlashScheduler,
  metricFlashDirection,
  pendingFlashCount,
  tickFlashDirection,
} from '../../src/lib/tickFlash.js'
import { FlashMetric } from '../../src/components/Fig.jsx'

describe('tickFlashDirection', () => {
  it('classifies later visible live prints', () => {
    expect(tickFlashDirection(100, 101, { now: 2_000 })).toBe('up')
    expect(tickFlashDirection(101, 100, { now: 2_000 })).toBe('down')
  })

  it('does not paint initial, unchanged, hidden, or resume-baseline prices', () => {
    expect(tickFlashDirection(null, 100, { now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 100, { now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 101, { baselinePending: true, now: 2_000 })).toBeNull()
    expect(tickFlashDirection(100, 101, { hidden: true, now: 2_000 })).toBeNull()
  })

  it('holds the solid paint longer than the old one-second block', () => {
    expect(TICK_FLASH_MS).toBe(1350)
  })

  it('paints daily-change metrics in the direction of the live tick', () => {
    expect(metricFlashDirection(1.2, 1.3, { kind: 'change' })).toBe('up')
    expect(metricFlashDirection(-1.2, -1.3, { kind: 'change' })).toBe('down')
  })

  it('paints only genuine new session extremes', () => {
    expect(metricFlashDirection(101, 102, { kind: 'high' })).toBe('up')
    expect(metricFlashDirection(102, 101, { kind: 'high' })).toBeNull()
    expect(metricFlashDirection(99, 98, { kind: 'low' })).toBe('down')
    expect(metricFlashDirection(98, 99, { kind: 'low' })).toBeNull()
  })

  it('keeps every metric quiet during hidden and resume-baseline updates', () => {
    expect(metricFlashDirection(1, 2, { kind: 'change', hidden: true })).toBeNull()
    expect(metricFlashDirection(100, 101, { kind: 'high', baselinePending: true })).toBeNull()
  })

  it('keeps percentage figures as colored text without inverse-video boxes', () => {
    const files = [
      'src/components/Tape.jsx',
      'src/pages/dashboard.jsx',
      'src/pages/markets.jsx',
      'src/pages/screen.jsx',
    ].map((file) => readFileSync(resolve(process.cwd(), file), 'utf8'))
      .concat(researchSource())
      .join('\n')

    expect(files).not.toMatch(/<FlashMetric[^>]+fmt=\{fmtPct\}/)
    expect(files).toContain('<FlashPrice price={q.price} fmt={fmtPrice} />')
    expect(files).toContain('<FlashMetric value={q.change} fmt={fmtChange} />')
  })
})

/** The board-wide flash sweep.
 *
 *  Before: every flashing cell armed its own TICK_FLASH_MS timer on every
 *  print, so a 37-row board under a websocket batch held hundreds of live
 *  timers and churned one arm + one clear per cell per tick. After: one
 *  wakeup for the whole board, at the earliest deadline owed.
 */
function fakeClock() {
  const timers = new Map()
  let t = 1_000_000
  let id = 0
  let arms = 0
  return {
    now: () => t,
    arms: () => arms,          // how many setTimeout calls the board paid for
    live: () => timers.size,   // how many are alive at once
    setTimer(fn, ms) {
      arms += 1
      const handle = ++id
      timers.set(handle, { at: t + Math.max(0, ms), fn })
      return handle
    },
    clearTimer(handle) { timers.delete(handle) },
    advance(ms) {
      const end = t + ms
      for (;;) {
        let due = null
        for (const [handle, entry] of timers) {
          if (!due || entry.at < due[1].at) due = [handle, entry]
        }
        if (!due || due[1].at > end) break
        t = due[1].at
        timers.delete(due[0])
        due[1].fn()
      }
      t = end
    },
  }
}

function fakeTab() {
  const subscribers = new Set()
  return {
    hidden: false,
    subscribers: () => subscribers.size,
    watch(fn) { subscribers.add(fn); return () => subscribers.delete(fn) },
    flip(hidden) { this.hidden = hidden; for (const fn of [...subscribers]) fn(hidden) },
  }
}

function harness() {
  const clock = fakeClock()
  const tab = fakeTab()
  const scheduler = createFlashScheduler({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    watchVisibility: (fn) => tab.watch(fn),
    isHidden: () => tab.hidden,
  })
  return { clock, tab, scheduler }
}

describe('createFlashScheduler', () => {
  it('costs one timer for a whole batch of cells flashing together', () => {
    const { clock, scheduler } = harness()
    const cleared = []
    for (let i = 0; i < 40; i++) scheduler.after(TICK_FLASH_MS, () => cleared.push(i))

    expect(clock.arms()).toBe(1)   // forty cells, one wakeup
    expect(clock.live()).toBe(1)
    expect(scheduler.pending()).toBe(40)

    clock.advance(TICK_FLASH_MS)
    expect(cleared).toHaveLength(40)
    expect(scheduler.pending()).toBe(0)
    expect(scheduler.armed()).toBe(false)
  })

  it('holds one live timer however staggered the deadlines are', () => {
    const { clock, scheduler } = harness()
    const order = []
    scheduler.after(TICK_FLASH_MS, () => order.push('a'))
    clock.advance(300)
    scheduler.after(TICK_FLASH_MS, () => order.push('b'))
    clock.advance(300)
    scheduler.after(TICK_FLASH_MS, () => order.push('c'))
    expect(clock.live()).toBe(1)

    clock.advance(TICK_FLASH_MS)
    expect(order).toEqual(['a', 'b', 'c'])
    expect(clock.live()).toBe(0)
  })

  it('re-arms earlier when a nearer deadline arrives after a distant one', () => {
    const { clock, scheduler } = harness()
    const fired = []
    scheduler.after(5_000, () => fired.push('late'))
    scheduler.after(100, () => fired.push('soon'))
    clock.advance(120)
    expect(fired).toEqual(['soon'])
    clock.advance(5_000)
    expect(fired).toEqual(['soon', 'late'])
  })

  it('survives a cell unmounting mid-flash', () => {
    const { clock, scheduler } = harness()
    const fired = []
    const cancelA = scheduler.after(TICK_FLASH_MS, () => fired.push('a'))
    scheduler.after(TICK_FLASH_MS, () => fired.push('b'))
    cancelA()
    cancelA() // idempotent: a cleanup that runs twice must not disturb the rest
    clock.advance(TICK_FLASH_MS)
    expect(fired).toEqual(['b'])
  })

  it('drops the timer and the visibility subscription when the board goes quiet', () => {
    const { clock, tab, scheduler } = harness()
    expect(tab.subscribers()).toBe(0)      // nothing scheduled, nothing held
    const cancel = scheduler.after(TICK_FLASH_MS, () => {})
    expect(tab.subscribers()).toBe(1)
    cancel()
    expect(clock.live()).toBe(0)
    expect(tab.subscribers()).toBe(0)
  })

  it('pays nothing while the tab is buried and clears the backlog on return', () => {
    const { clock, tab, scheduler } = harness()
    const fired = []
    scheduler.after(TICK_FLASH_MS, () => fired.push('a'))
    tab.flip(true)
    expect(clock.live()).toBe(0)           // no wakeup owed to a hidden tab
    clock.advance(60_000)
    expect(fired).toEqual([])              // …and none taken

    tab.flip(false)
    // the flash the reader missed is retired on the way in, not held on screen
    expect(fired).toEqual(['a'])
    expect(scheduler.pending()).toBe(0)
  })

  it('keeps a not-yet-due flash alive across a quick tab flip', () => {
    const { clock, tab, scheduler } = harness()
    const fired = []
    scheduler.after(TICK_FLASH_MS, () => fired.push('a'))
    tab.flip(true)
    tab.flip(false)
    expect(fired).toEqual([])
    clock.advance(TICK_FLASH_MS)
    expect(fired).toEqual(['a'])
  })

  it('does not let one throwing cell strand the rest of the board', () => {
    const { clock, scheduler } = harness()
    const after = vi.fn()
    scheduler.after(TICK_FLASH_MS, () => { throw new Error('bad cell') })
    scheduler.after(TICK_FLASH_MS, after)
    expect(() => clock.advance(TICK_FLASH_MS)).not.toThrow()
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('retires near-misses in the same sweep instead of re-arming for 2ms', () => {
    const { clock, scheduler } = harness()
    const fired = []
    scheduler.after(TICK_FLASH_MS, () => fired.push('a'))
    clock.advance(2)                 // a print two milliseconds later
    scheduler.after(TICK_FLASH_MS, () => fired.push('b'))
    clock.advance(TICK_FLASH_MS)
    // both retired on one wakeup: no second timer for the 2ms tail
    expect(fired).toEqual(['a', 'b'])
    expect(clock.arms()).toBe(1)
  })

  it('is inert with no callback', () => {
    const { clock, scheduler } = harness()
    expect(typeof scheduler.after(TICK_FLASH_MS, null)).toBe('function')
    expect(clock.live()).toBe(0)
  })
})

describe('the flashing cells', () => {
  const fig = readFileSync(resolve(process.cwd(), 'src/components/Fig.jsx'), 'utf8')

  it('arms no timer of its own — the board sweep owns every expiry', () => {
    expect(fig).not.toContain('setTimeout(')
    expect(fig).not.toContain('clearTimeout(')
    expect(fig).toContain('scheduleFlashExpiry(TICK_FLASH_MS')
  })
})

/** The whole path, mounted: a print paints the digits that moved and the
 *  board sweep — not a timer this cell owns — takes the box back off. */
describe('a flashing cell end to end', () => {
  const fmt = (v) => v.toFixed(2)
  const flush = () => new Promise((r) => setTimeout(r, 40))
  // Real timers, real jsdom: the 1350ms clear needs more than 1.1s of
  // event-loop headroom on a loaded box — this failed ~1 in 3 cold runs at
  // 2_500 (2026-08-22). Budget scales with the flash, pass speed unchanged.
  const waitFor = async (pred, ms = TICK_FLASH_MS * 3) => {
    const t0 = Date.now()
    while (!pred()) {
      if (Date.now() - t0 > ms) return false
      await new Promise((r) => setTimeout(r, 20))
    }
    return true
  }
  let host = null
  let hadRaf = null

  beforeEach(() => {
    hadRaf = globalThis.requestAnimationFrame
    if (typeof hadRaf !== 'function') {
      globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
      globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
    }
    host = document.createElement('div')
    document.body.appendChild(host)
  })

  afterEach(() => {
    render(null, host)
    host.remove()
    if (typeof hadRaf !== 'function') {
      delete globalThis.requestAnimationFrame
      delete globalThis.cancelAnimationFrame
    }
  })

  it('paints only the digits that moved, for TICK_FLASH_MS, then clears', async () => {
    render(h(FlashMetric, { value: 100, fmt }), host)
    await flush()
    expect(host.textContent).toBe('100.00')
    expect(pendingFlashCount()).toBe(0)

    render(h(FlashMetric, { value: 100.05, fmt }), host)
    expect(await waitFor(() => host.querySelector('.px-flash-up'))).toBe(true)
    expect(host.querySelector('.px-flash-up').textContent).toBe('5')
    expect(host.textContent).toBe('100.05')
    expect(pendingFlashCount()).toBe(1)

    expect(await waitFor(() => !host.querySelector('.px-flash-up'))).toBe(true)
    expect(host.textContent).toBe('100.05')
    expect(pendingFlashCount()).toBe(0)
  })

  it('leaves nothing pending in the sweep when a cell unmounts mid-flash', async () => {
    render(h(FlashMetric, { value: 100, fmt }), host)
    await flush()
    render(h(FlashMetric, { value: 100.05, fmt }), host)
    expect(await waitFor(() => host.querySelector('.px-flash-up'))).toBe(true)
    expect(pendingFlashCount()).toBe(1)
    render(null, host)
    expect(pendingFlashCount()).toBe(0)
  })
})
