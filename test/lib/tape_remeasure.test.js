import { h, render } from 'preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/hooks.js', () => ({
  useTapeSymbols: () => ['MU'],
  useQuotes: () => ({}),
  useWatchlist: () => ['MU'],
}))

import { Tape } from '../../src/components/Tape.jsx'

let host
let cycleWidth
let resize
let animation
const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')

beforeEach(() => {
  cycleWidth = 500
  animation = { currentTime: 7_250, playState: 'paused' }
  vi.stubGlobal('ResizeObserver', class {
    constructor(fn) { resize = fn }
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('requestAnimationFrame', (fn) => { fn(); return 1 })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return { width: this.classList.contains('tape-cycle') ? cycleWidth : 390, height: 24, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {} }
  })
  Object.defineProperty(HTMLElement.prototype, 'getAnimations', {
    configurable: true,
    value() { return this.classList.contains('tape-scroll') ? [animation] : [] },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 390 })
})

afterEach(() => {
  if (host) render(null, host)
  host?.remove()
  host = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete HTMLElement.prototype.getAnimations
  if (clientWidthDescriptor) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor)
  else delete HTMLElement.prototype.clientWidth
})

describe('ticker tape cycle remeasurement', () => {
  it('restores the running clock instead of snapping to animation zero', async () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    render(h(Tape), host)
    await new Promise((resolve) => setTimeout(resolve))

    animation.currentTime = 12_000
    cycleWidth = 1_000
    resize()
    await new Promise((resolve) => setTimeout(resolve))

    expect(animation.currentTime).toBe(12_000)
  })
})
