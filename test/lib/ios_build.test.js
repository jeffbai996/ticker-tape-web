// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { iosBuildOptions } from '../../scripts/iosBuildOptions.mjs'

describe('bundled iOS build', () => {
  it('uses root-relative bundled assets and keeps the preview separate from web output', () => {
    const options = iosBuildOptions({})
    expect(options.base).toBe('/')
    expect(options.build.outDir).toBe('dist-ios')
    expect(options.define['import.meta.env.VITE_IOS']).toBe('"1"')
    expect(options.define['import.meta.env.VITE_PUBLIC_DEMO']).toBe('"1"')
    expect(options.define['import.meta.env.VITE_FAMILY_BUILD']).toBe('"0"')
    expect(options.define['import.meta.env.VITE_SYNC_CAPABILITY']).toBe('""')
  })

  it('refuses to package a shared family capability into the public preview', () => {
    expect(() => iosBuildOptions({ VITE_SYNC_CAPABILITY: 'a'.repeat(32) })).toThrow(/family/i)
  })

  it('requires an existing capability before enabling family sync', () => {
    expect(() => iosBuildOptions({ VITE_FAMILY_BUILD: '1' })).toThrow(/capability/i)
    expect(() => iosBuildOptions({ VITE_FAMILY_BUILD: '1', VITE_SYNC_CAPABILITY: 'invalid' })).toThrow(/capability/i)
    const options = iosBuildOptions({ VITE_FAMILY_BUILD: '1', VITE_SYNC_CAPABILITY: 'a'.repeat(32) })
    expect(options.define['import.meta.env.VITE_PUBLIC_DEMO']).toBe('"0"')
    expect(options.define['import.meta.env.VITE_FAMILY_BUILD']).toBe('"1"')
    expect(options.define['import.meta.env.VITE_SYNC_CAPABILITY']).toBe(JSON.stringify('a'.repeat(32)))
  })

  it('refuses a private broker build instead of silently combining audiences', () => {
    expect(() => iosBuildOptions({ VITE_PRIVATE: '1' })).toThrow(/private/i)
  })
})
