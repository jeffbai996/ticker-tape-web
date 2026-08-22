/** The app shell launches from disk; data never does. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from '../../src/lib/pwa.js'

const src = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('service worker source', () => {
  const sw = src('public/sw.js')
  it('caches hashed assets first, HTML network-first, and leaves other origins alone', () => {
    expect(sw).toContain("url.pathname.includes('/assets/')")
    expect(sw).toContain('cacheFirst(req)')
    expect(sw).toContain('networkFirst(req)')
    expect(sw).toContain('if (url.origin !== self.location.origin) return')
  })
  it('is versioned per build and evicts older builds on activate', () => {
    expect(sw).toContain("const VERSION = '__BUILD__'")
    expect(sw).toMatch(/names\.filter\(\(n\) => n\.startsWith\('ttw-'\) && n !== CACHE\)/)
    expect(src('vite.config.js')).toContain("replace('__BUILD__'")
  })
  it('uses scope-relative paths so the Pages base and the tailnet root both work', () => {
    expect(sw).not.toMatch(/['"]\/ticker-tape-web\//)
    const manifest = JSON.parse(src('public/manifest.webmanifest'))
    expect(manifest.start_url).toBe('./')
    expect(manifest.scope).toBe('./')
    expect(manifest.display).toBe('standalone')
  })
})

describe('registerServiceWorker', () => {
  it('registers at the build base in production and never in dev or without support', async () => {
    const register = vi.fn(async () => ({ update: vi.fn(async () => {}) }))
    const nav = { serviceWorker: { register } }
    await registerServiceWorker({ nav, base: '/ticker-tape-web/', dev: false })
    expect(register).toHaveBeenCalledWith('/ticker-tape-web/sw.js', { scope: '/ticker-tape-web/' })
    await registerServiceWorker({ nav, base: '/', dev: false })
    expect(register).toHaveBeenLastCalledWith('/sw.js', { scope: '/' })
    expect(registerServiceWorker({ nav, base: '/', dev: true })).toBeNull()
    expect(registerServiceWorker({ nav: {}, base: '/', dev: false })).toBeNull()
  })
  it('is wired at boot, after the app renders', () => {
    const main = src('src/main.jsx')
    expect(main.indexOf('render(<App />')).toBeLessThan(main.indexOf('registerServiceWorker()'))
  })
})
