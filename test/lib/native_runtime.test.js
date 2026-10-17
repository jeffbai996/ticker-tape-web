import { afterEach, describe, expect, it, vi } from 'vitest'
import { isNativeApp, configureNativeShell } from '../../src/lib/native.js'
import { startFreshnessWatch } from '../../src/lib/freshness.js'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('native runtime', () => {
  it('enables safe-area layout only for the native shell', () => {
    const root = document.createElement('html')
    configureNativeShell({ root, native: false })
    expect(root.dataset.nativeApp).toBeUndefined()
    configureNativeShell({ root, native: true })
    expect(root.dataset.nativeApp).toBe('true')
  })
  it('recognizes an iOS bridge without treating the web bridge as native', () => {
    expect(isNativeApp()).toBe(false)
    expect(isNativeApp({ isNativePlatform: () => true })).toBe(true)
    expect(isNativeApp({ isNativePlatform: () => false })).toBe(false)
    expect(isNativeApp({})).toBe(false)
  })

  it('does not poll the bundled index for a web deployment or reload on resume', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true })
    const interval = vi.spyOn(globalThis, 'setInterval')
    const listener = vi.spyOn(document, 'addEventListener')
    const script = document.createElement('script')
    script.src = '/assets/index-test.js'
    document.head.append(script)
    try {
      startFreshnessWatch()
      expect(interval).not.toHaveBeenCalled()
      expect(listener).not.toHaveBeenCalled()
    } finally {
      script.remove()
    }
  })
})
