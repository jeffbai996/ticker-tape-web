import { afterEach, describe, expect, it, vi } from 'vitest'
import { installPolyfills } from '../../tv/lib/polyfills.js'

describe('TV runtime polyfills', () => {
  afterEach(() => vi.useRealTimers())

  it('adds AbortSignal.timeout where the runtime lacks it', () => {
    vi.useFakeTimers()
    class FakeSignal {}
    const target = { AbortSignal: FakeSignal, AbortController: globalThis.AbortController }
    installPolyfills(target)
    const signal = target.AbortSignal.timeout(50)
    expect(signal.aborted).toBe(false)
    vi.advanceTimersByTime(50)
    expect(signal.aborted).toBe(true)
  })

  it('leaves a native AbortSignal.timeout alone', () => {
    const native = () => 'native'
    const target = { AbortSignal: { timeout: native }, AbortController: globalThis.AbortController }
    installPolyfills(target)
    expect(target.AbortSignal.timeout).toBe(native)
  })

  it('adds Array.prototype.at and Object.hasOwn equivalents when missing', () => {
    const arrayProto = {}
    const target = {
      AbortSignal: { timeout() {} },
      Array: { prototype: arrayProto },
      Object: { hasOwn: undefined },
    }
    installPolyfills(target)
    expect(arrayProto.at.call([1, 2, 3], -1)).toBe(3)
    expect(arrayProto.at.call([1, 2, 3], 5)).toBeUndefined()
    expect(target.Object.hasOwn({ a: 1 }, 'a')).toBe(true)
    expect(target.Object.hasOwn({}, 'toString')).toBe(false)
  })
})
