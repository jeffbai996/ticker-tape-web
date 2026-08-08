import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { pushWatchlistToWire } from '../../src/lib/watchlistExport.js'

describe('watchlist export', () => {
  it('posts the selected card symbols to fragwire', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    })

    await expect(pushWatchlistToWire('https://wire.example', ['AAA', 'BBB'], fetcher))
      .resolves.toEqual({ ok: true })
    expect(fetcher).toHaveBeenCalledWith('https://wire.example/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add: ['AAA', 'BBB'] }),
    })
  })

  it('keeps the export action on watchlist cards, not the wire page', () => {
    const cards = fs.readFileSync(`${process.cwd()}/src/pages/watchlists.jsx`, 'utf8')
    const wire = fs.readFileSync(`${process.cwd()}/src/pages/wire.jsx`, 'utf8')
    expect(cards).toContain("tl('export')")
    expect(cards).toContain("tl('rename')")
    expect(cards).toContain("tl('delete')")
    expect(wire).not.toContain('push watchlist → wire')
  })
})
