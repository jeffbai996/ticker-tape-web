import { describe, expect, it, vi } from 'vitest'
import { fetchEvents } from '../../src/lib/wire.js'

describe('fetchEvents', () => {
  const call = async (opts) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
    vi.stubGlobal('fetch', fetchMock)
    await fetchEvents('http://wire', opts)
    vi.unstubAllGlobals()
    return fetchMock.mock.calls[0][0]
  }

  // a since_id=0 backfill without this returns the OLDEST rows in the archive
  it('asks for the tail of the archive when newest is set', async () => {
    expect(await call({ limit: 300, newest: true }))
      .toBe('http://wire/api/events?since_id=0&limit=300&newest=1')
  })

  it('stays a plain forward read otherwise', async () => {
    expect(await call({ sinceId: 12, limit: 50 }))
      .toBe('http://wire/api/events?since_id=12&limit=50')
  })

  it('throws on a bad response so the caller can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }))
    await expect(fetchEvents('http://wire')).rejects.toThrow('wire 502')
    vi.unstubAllGlobals()
  })
})
