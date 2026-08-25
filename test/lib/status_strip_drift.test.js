import { h, render } from 'preact'
import { act } from 'preact/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StatusBar } from '../../src/components/StatusBar.jsx'

// The index strip has two branches — the drifting belt and the resting list.
// Stopping the drift writes `animation`, `transition` and a translate straight
// onto the belt node. If Preact hands that same element to the resting branch,
// the leftover translate parks a `w-full` strip a whole cycle to the left of
// its own box and the row renders empty (Jeff 2026-08-25: "a second or so
// after it goes back to starting position after stopping it, it goes black").

// jsdom has no DOMMatrix, and the stop handler reads the belt's current
// offset through one. Parse the same thing it would: m41 is the x translate.
class TestDOMMatrix {
  constructor(transform = '') {
    const m = /matrix\(([^)]+)\)/.exec(String(transform || ''))
    this.m41 = m ? Number(m[1].split(',')[4]) || 0 : 0
  }
}

let host
beforeEach(() => {
  globalThis.DOMMatrix = TestDOMMatrix
  localStorage.setItem('strip_drift_v1', '1')      // mount already drifting
  host = document.createElement('div')
  document.body.appendChild(host)
})
afterEach(() => {
  if (host) render(null, host)
  host?.remove()
  host = null
  localStorage.removeItem('strip_drift_v1')
  vi.useRealTimers()
})

function strip() {
  return host.querySelector('[data-strip-belt]')
    || host.querySelector('.w-full.flex.items-baseline.overflow-x-auto')
}

describe('index strip: stopping the drift', () => {
  it('hands the resting strip a clean node, not the belt with its stop styles on it', () => {
    vi.useFakeTimers()
    render(h(StatusBar, {}), host)

    const belt = host.querySelector('[data-strip-belt]')
    expect(belt).not.toBeNull()

    // exactly what toggleDrift writes on the way out
    belt.style.animation = 'none'
    belt.style.transition = 'transform 700ms cubic-bezier(0.22, 1, 0.36, 1)'
    belt.style.transform = 'translateX(-2266px)'

    // act() flushes preact's rerender queue, which is async — without it the
    // belt is still mounted when the assertions run
    act(() => { host.querySelector("button[title*='drift']").click() })
    act(() => { vi.advanceTimersByTime(4000) })   // past the glide and 'off'

    const resting = strip()
    expect(resting).not.toBeNull()
    expect(resting.hasAttribute('data-strip-belt')).toBe(false)
    // the actual defect: a resting strip translated off its own box
    expect(resting.style.transform).toBe('')
    expect(resting.style.animation).toBe('')
    expect(resting).not.toBe(belt)
  })
})
