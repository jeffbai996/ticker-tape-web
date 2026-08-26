import { describe, expect, it, vi } from 'vitest'
import { fetchEvents, fetchUpdates } from '../../src/lib/wire.js'

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

  it('asks the service for a category tail when a category is selected', async () => {
    expect(await call({ limit: 200, newest: true,
      types: 'fed_speech,fed_headline,macro_print' }))
      .toBe('http://wire/api/events?since_id=0&limit=200&newest=1&types=fed_speech%2Cfed_headline%2Cmacro_print')
  })

  it('throws on a bad response so the caller can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502 }))
    await expect(fetchEvents('http://wire')).rejects.toThrow('wire 502')
    vi.unstubAllGlobals()
  })
})

describe('fetchUpdates', () => {
  it('asks for revisions newer than the server marker', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ events: [], server_ts: 12.5 }),
    })
    vi.stubGlobal('fetch', fetchMock)
    await fetchUpdates('http://wire', 10.25)
    expect(fetchMock.mock.calls[0][0]).toBe('http://wire/api/updates?since=10.25')
    vi.unstubAllGlobals()
  })
})
