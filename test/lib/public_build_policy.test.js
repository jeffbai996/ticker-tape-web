// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { publicBuildSettings } from '../../scripts/publicBuildPolicy.mjs'

describe('public distribution builds', () => {
  it('always compiles the synthetic demo mode', () => {
    expect(publicBuildSettings({}).define).toMatchObject({
      'import.meta.env.VITE_PUBLIC_DEMO': '"1"',
    })
  })

  it('refuses credentials and enabled private features before compilation', () => {
    for (const key of ['VITE_SYNC_CAPABILITY', 'VITE_READER_CAPABILITY', 'VITE_PRIVATE', 'VITE_FAMILY_BUILD', 'VITE_FAMILY_AI', 'VITE_NEWS_PORTFOLIO_IDS']) {
      expect(() => publicBuildSettings({ [key]: 'test-only-value' })).toThrow(/public demo/)
    }
  })

  it('allows explicitly disabled private feature flags', () => {
    expect(() => publicBuildSettings({ VITE_PRIVATE: '0', VITE_FAMILY_BUILD: '0', VITE_FAMILY_AI: '0' })).not.toThrow()
  })
})
