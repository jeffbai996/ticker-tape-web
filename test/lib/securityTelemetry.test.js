import { describe, expect, it, vi } from 'vitest'
import { familyViewEndpoint, recordFamilyView } from '../../src/lib/securityTelemetry.js'

const TOKEN = 'a'.repeat(32)
const DEVICE = 'b'.repeat(32)

function memorySession() {
  const rows = new Map()
  return {
    getItem: (key) => rows.get(key) || null,
    setItem: (key, value) => rows.set(key, value),
  }
}

describe('family page execution beacon', () => {
  it('derives a fixed telemetry route without putting the capability in its URL', () => {
    const url = familyViewEndpoint(TOKEN, 'https://worker.test')
    expect(url).toBe('https://worker.test/telemetry/family-view')
    expect(url).not.toContain(TOKEN)
  })

  it('sends once per tab session and carries credentials only in headers', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }))
    const session = memorySession()
    const args = { capability: TOKEN, base: 'https://worker.test', fetchImpl, session, deviceId: DEVICE }
    expect(await recordFamilyView(args)).toBe(true)
    expect(await recordFamilyView(args)).toBe(true)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).not.toContain(TOKEN)
    expect(init.headers).toEqual({ Authorization: `Bearer ${TOKEN}`, 'X-TTW-Device-ID': DEVICE })
    expect(init.keepalive).toBe(true)
  })

  it('does not retry or emit anything without a valid build capability', async () => {
    const fetchImpl = vi.fn()
    expect(await recordFamilyView({ capability: '', fetchImpl, deviceId: DEVICE })).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
