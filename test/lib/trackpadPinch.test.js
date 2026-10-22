// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { attachTrackpadPinch } from '../../src/lib/trackpadPinch.js'

const cleanups = []
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); document.body.replaceChildren() })
function mount() {
  const host = document.createElement('div')
  const canvas = document.createElement('canvas')
  host.append(canvas); document.body.append(host)
  cleanups.push(attachTrackpadPinch(host))
  const received = []
  canvas.addEventListener('wheel', event => received.push(event))
  return { host, canvas, received }
}
function wheel(canvas, values) {
  const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...values })
  canvas.dispatchEvent(event)
  return event
}

describe('trackpad pinch', () => {
  it('boosts pinch once while preserving the native chart anchor and units', () => {
    const { canvas, received } = mount()
    const original = wheel(canvas, { ctrlKey: true, deltaY: -10, deltaX: 2,
      deltaMode: 1, clientX: 240, clientY: 80, shiftKey: true })
    expect(original.defaultPrevented).toBe(true)
    expect(received).toHaveLength(1)
    expect(received[0].deltaY).toBe(-30)
    expect(received[0].deltaX).toBe(2)
    expect(received[0].deltaMode).toBe(1)
    expect(received[0].clientX).toBe(240)
    expect(received[0].clientY).toBe(80)
    expect(received[0].ctrlKey).toBe(true)
    expect(received[0].shiftKey).toBe(true)
  })

  it('keeps ordinary vertical and horizontal scrolling completely unchanged', () => {
    const { canvas, received } = mount()
    for (const values of [{deltaY:30}, {deltaX:25}, {deltaX:3,deltaY:-20}]) {
      const original = wheel(canvas, values)
      expect(received.at(-1)).toBe(original)
      expect(original.defaultPrevented).toBe(false)
    }
    expect(received).toHaveLength(3)
  })

  it('does not swallow an event that cannot be cancelled', () => {
    const { canvas, received } = mount()
    const original = wheel(canvas, {ctrlKey:true, deltaY:-10, cancelable:false})
    expect(received).toEqual([original])
  })

  it('removes the boost on disposal and never stacks it across remounts', () => {
    const { host, canvas, received } = mount()
    cleanups.pop()()
    const original = wheel(canvas, {ctrlKey:true, deltaY:10})
    expect(received).toEqual([original])
    cleanups.push(attachTrackpadPinch(host))
    wheel(canvas, {ctrlKey:true, deltaY:10})
    expect(received).toHaveLength(2)
    expect(received[1].deltaY).toBe(30)
  })
})
