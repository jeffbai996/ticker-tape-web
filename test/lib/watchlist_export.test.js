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
      body: JSON.stringify({ add: [
        { symbol: 'AAA', instrument_type: '' },
        { symbol: 'BBB', instrument_type: '' },
      ] }),
    })
  })

  it('replaces the primary list and forwards known instrument types', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ ok: true }),
    })
    const quoteLookup = (symbol) => ({ quote: {
      quoteType: symbol === 'SPY' ? 'ETF' : 'EQUITY',
    } })

    await pushWatchlistToWire('https://wire.example', ['NVDA', 'SPY'], fetcher,
      { replace: true, quoteLookup })
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ replace: [
      { symbol: 'NVDA', instrument_type: 'EQUITY' },
      { symbol: 'SPY', instrument_type: 'ETF' },
    ] })
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
