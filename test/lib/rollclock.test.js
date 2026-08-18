/** The rolodex clock is the one timer that runs on every route, so what it
 *  does per tick is the shell's idle floor: a repeat value must cost nothing,
 *  and unmounting must not leave roll timers pointed at detached nodes. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { paintRollingTime, stopRollingTime, CLOCK_ZONES } from '../../src/lib/rollclock.js'

const el = () => document.createElement('span')

describe('paintRollingTime', () => {
  beforeEach(() => { vi.useRealTimers() })

  it('builds one cell per character, digits as wheels and the rest as marks', () => {
    const node = el()
    paintRollingTime(node, '09:41')
    expect(node.children).toHaveLength(5)
    expect([...node.children].map((c) => c.className)).toEqual([
      'time-wheel-digit', 'time-wheel-digit', 'time-wheel-mark',
      'time-wheel-digit', 'time-wheel-digit',
    ])
    expect(node.getAttribute('aria-label')).toBe('09:41')
  })

  it('does nothing at all when asked to paint the value already on screen', () => {
    const node = el()
    paintRollingTime(node, '09:41:07')
    const cells = [...node.children]
    node.removeAttribute('aria-label')          // a repaint would put it back
    paintRollingTime(node, '09:41:07')
    expect(node.getAttribute('aria-label')).toBe(null)
    expect([...node.children]).toEqual(cells)   // same nodes, not rebuilt
  })

  it('rolls only the digits that changed', () => {
    const node = el()
    paintRollingTime(node, '09:41:07')
    paintRollingTime(node, '09:41:08')
    const rolling = [...node.children].filter((c) => c.classList.contains('rolling'))
    expect(rolling).toHaveLength(1)
    expect(rolling[0].dataset.value).toBe('8')
  })

  it('settles a rolled digit back to a single face', () => {
    vi.useFakeTimers()
    const node = el()
    paintRollingTime(node, '07')
    paintRollingTime(node, '08')
    vi.advanceTimersByTime(400)
    const cell = node.children[1]
    expect(cell.classList.contains('rolling')).toBe(false)
    expect(cell.innerHTML).toBe('<span class="time-wheel-face">8</span>')
    vi.useRealTimers()
  })
})

describe('stopRollingTime', () => {
  it('cancels the pending settle timers so nothing fires after unmount', () => {
    vi.useFakeTimers()
    const node = el()
    paintRollingTime(node, '07')
    paintRollingTime(node, '08')
    expect(node.children[1].rollTimer).toBeTruthy()
    stopRollingTime(node)
    expect(node.children[1].rollTimer).toBe(null)
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })

  it('settles the cell where the timer would have, so a repaint starts clean', () => {
    // the timezone cycle tears the effect down and paints the new zone in the
    // same commit — a digit left mid-roll would have stayed there
    vi.useFakeTimers()
    const node = el()
    paintRollingTime(node, '07')
    paintRollingTime(node, '08')
    stopRollingTime(node)
    const cell = node.children[1]
    expect(cell.classList.contains('rolling')).toBe(false)
    expect(cell.innerHTML).toBe('<span class="time-wheel-face">8</span>')
    vi.useRealTimers()
  })

  it('is safe on a ref that never mounted', () => {
    expect(() => stopRollingTime(null)).not.toThrow()
  })
})

describe('CLOCK_ZONES', () => {
  it('names IANA zones so DST is never our arithmetic', () => {
    expect(CLOCK_ZONES.map((z) => z.id)).toEqual([
      'America/New_York', 'Asia/Hong_Kong', 'America/Los_Angeles',
    ])
    for (const zone of CLOCK_ZONES) expect(zone.id).toContain('/')
  })
})
