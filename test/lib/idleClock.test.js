/** The shared "stop while nobody is looking" clock. Every repeating job in
 *  the shell, the tape, the wire and the event workspace runs on this, so its
 *  contract is worth pinning: aligned to the period, silent while hidden, one
 *  catch-up on the way back, and nothing left behind when it is stopped. */
import { describe, expect, it, vi } from 'vitest'
import { alignedDelay, startVisibleClock } from '../../src/lib/idleClock.js'

/** A document stand-in with a visibility flag and real listener bookkeeping. */
function fakeDoc() {
  const listeners = new Set()
  return {
    hidden: false,
    listeners,
    addEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.add(fn) },
    removeEventListener: (type, fn) => { if (type === 'visibilitychange') listeners.delete(fn) },
    setHidden(value) {
      this.hidden = value
      for (const fn of [...listeners]) fn()
    },
  }
}

/** Manually driven timers, so a 20-second test takes no time at all. */
function fakeTimers() {
  let seq = 1
  const pending = new Map()
  return {
    pending,
    setTimer: (fn, delay) => { const id = seq++; pending.set(id, { fn, delay }); return id },
    clearTimer: (id) => { pending.delete(id) },
    /** Fire whatever is currently armed, once. */
    fire() {
      const [id, entry] = [...pending.entries()][0] || []
      if (entry == null) return null
      pending.delete(id)
      entry.fn()
      return entry.delay
    },
  }
}

describe('alignedDelay', () => {
  it('lands on the next period boundary rather than a period from now', () => {
    expect(alignedDelay(1_000_000_250, 1000)).toBe(750)
    expect(alignedDelay(1_000_000_999, 1000)).toBe(1)
  })

  it('gives a full period when already on the boundary — never a zero-delay spin', () => {
    expect(alignedDelay(1_000_000_000, 1000)).toBe(1000)
    expect(alignedDelay(0, 30_000)).toBe(30_000)
  })

  it('handles coarse periods and refuses nonsense ones', () => {
    expect(alignedDelay(90_000, 60_000)).toBe(30_000)
    expect(alignedDelay(5, 0)).toBe(0)
    expect(alignedDelay(5, -1)).toBe(0)
  })
})

describe('startVisibleClock', () => {
  const start = (doc, timers, tick, periodMs = 1000) => startVisibleClock(periodMs, tick, {
    doc,
    now: () => 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  })

  it('reschedules itself after every tick', () => {
    const doc = fakeDoc(); const timers = fakeTimers(); const tick = vi.fn()
    start(doc, timers, tick)
    timers.fire(); timers.fire(); timers.fire()
    expect(tick).toHaveBeenCalledTimes(3)
    expect(timers.pending.size).toBe(1)      // exactly one armed, never a pile
  })

  it('arms nothing at all while the document starts hidden', () => {
    const doc = fakeDoc(); doc.hidden = true
    const timers = fakeTimers(); const tick = vi.fn()
    start(doc, timers, tick)
    expect(timers.pending.size).toBe(0)
    expect(tick).not.toHaveBeenCalled()
  })

  it('cancels the armed timer when the tab is buried', () => {
    const doc = fakeDoc(); const timers = fakeTimers(); const tick = vi.fn()
    start(doc, timers, tick)
    expect(timers.pending.size).toBe(1)
    doc.setHidden(true)
    expect(timers.pending.size).toBe(0)
    expect(tick).not.toHaveBeenCalled()
  })

  it('takes one catch-up tick on the way back, then resumes the cadence', () => {
    const doc = fakeDoc(); const timers = fakeTimers(); const tick = vi.fn()
    start(doc, timers, tick)
    doc.setHidden(true)
    doc.setHidden(false)
    expect(tick).toHaveBeenCalledTimes(1)    // the screen is current again NOW
    expect(timers.pending.size).toBe(1)
    timers.fire()
    expect(tick).toHaveBeenCalledTimes(2)
  })

  it('skips the catch-up for a job that mints something instead of refreshing it', () => {
    const doc = fakeDoc(); const timers = fakeTimers(); const tick = vi.fn()
    startVisibleClock(1000, tick, {
      doc, now: () => 0, catchUp: false,
      setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    })
    doc.setHidden(true)
    doc.setHidden(false)
    expect(tick).not.toHaveBeenCalled()      // no burst of rows for alt-tabbing
    expect(timers.pending.size).toBe(1)      // but the cadence is back on
  })

  it('does not double up when visibilitychange fires while already running', () => {
    const doc = fakeDoc(); const timers = fakeTimers(); const tick = vi.fn()
    start(doc, timers, tick)
    doc.setHidden(false)
    doc.setHidden(false)
    expect(tick).not.toHaveBeenCalled()
    expect(timers.pending.size).toBe(1)
  })

  it('a timer that fires after the tab went hidden does not tick or rearm', () => {
    const doc = fakeDoc(); const timers = fakeTimers(); const tick = vi.fn()
    start(doc, timers, tick)
    const armed = [...timers.pending.entries()][0]
    doc.hidden = true                        // hidden without the event landing yet
    armed[1].fn()
    expect(tick).not.toHaveBeenCalled()
    expect(timers.pending.size).toBe(1)      // the pre-existing entry, not a new one
  })

  it('stop() drops the timer and the visibility listener', () => {
    const doc = fakeDoc(); const timers = fakeTimers(); const tick = vi.fn()
    const stop = start(doc, timers, tick)
    stop()
    expect(timers.pending.size).toBe(0)
    expect(doc.listeners.size).toBe(0)
    doc.setHidden(false)
    expect(tick).not.toHaveBeenCalled()
  })

  it('survives a document that has no visibility API at all', () => {
    const timers = fakeTimers(); const tick = vi.fn()
    const stop = startVisibleClock(1000, tick, {
      doc: undefined, now: () => 0, setTimer: timers.setTimer, clearTimer: timers.clearTimer,
    })
    timers.fire()
    expect(tick).toHaveBeenCalledTimes(1)
    expect(() => stop()).not.toThrow()
  })
})
