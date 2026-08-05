import { describe, expect, it, vi } from 'vitest'
import { createQuoteRenderGate } from '../../src/lib/quoteRenderGate.js'

describe('createQuoteRenderGate', () => {
  it('keeps accepting hidden updates but renders only the latest state once visible', () => {
    let hidden = true
    const frames = []
    const render = vi.fn()
    const gate = createQuoteRenderGate({
      isHidden: () => hidden,
      scheduleFrame: (fn) => { frames.push(fn); return frames.length },
      cancelFrame: vi.fn(),
      render,
    })

    gate.onFeedUpdate()
    gate.onFeedUpdate()
    gate.onFeedUpdate()
    expect(frames).toHaveLength(0)
    expect(render).not.toHaveBeenCalled()

    hidden = false
    gate.onVisibilityChange()
    gate.onFeedUpdate()
    gate.onFeedUpdate()
    expect(frames).toHaveLength(1)

    frames.shift()()
    expect(render).toHaveBeenCalledTimes(1)
  })

  it('batches visible feed bursts to one render per animation frame', () => {
    const frames = []
    const render = vi.fn()
    const gate = createQuoteRenderGate({
      isHidden: () => false,
      scheduleFrame: (fn) => { frames.push(fn); return frames.length },
      cancelFrame: vi.fn(),
      render,
    })

    gate.onFeedUpdate()
    gate.onFeedUpdate()
    expect(frames).toHaveLength(1)
    frames.shift()()
    expect(render).toHaveBeenCalledTimes(1)

    gate.onFeedUpdate()
    expect(frames).toHaveLength(1)
    frames.shift()()
    expect(render).toHaveBeenCalledTimes(2)
  })
})
