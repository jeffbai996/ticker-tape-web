import { describe, expect, it } from 'vitest'
import { getTtwDeviceId, ttwDeviceHeader, validTtwDeviceId } from '../../src/lib/deviceIdentity.js'

function memoryStore() {
  const rows = new Map()
  return {
    getItem: (key) => rows.get(key) || null,
    setItem: (key, value) => rows.set(key, value),
  }
}

describe('family device identity', () => {
  it('creates one random, non-secret identity and keeps it stable', () => {
    const store = memoryStore()
    const cryptoApi = { randomUUID: () => '12345678-1234-1234-1234-123456789abc' }
    expect(getTtwDeviceId(store, cryptoApi)).toBe('12345678123412341234123456789abc')
    cryptoApi.randomUUID = () => 'ffffffff-ffff-ffff-ffff-ffffffffffff'
    expect(getTtwDeviceId(store, cryptoApi)).toBe('12345678123412341234123456789abc')
  })

  it('never falls back to a predictable identifier', () => {
    const store = memoryStore()
    expect(getTtwDeviceId(store, {})).toBe('')
    expect(ttwDeviceHeader('bad')).toEqual({})
    expect(validTtwDeviceId('a'.repeat(32))).toBe(true)
  })
})
