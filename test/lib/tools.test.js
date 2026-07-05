import { describe, it, expect, beforeEach } from 'vitest'
import { cleanSymbols, toolLabel, executeTool, TOOL_DEFS } from '../../src/lib/tools.js'
import { loadAlerts } from '../../src/lib/alerts.js'
import { getWatchlist } from '../../src/lib/watchlist.js'

beforeEach(() => {
  localStorage.clear()
  location.hash = ''
})

describe('TOOL_DEFS', () => {
  it('every def has a name, description, and object schema', () => {
    for (const t of TOOL_DEFS) {
      expect(t.name).toMatch(/^[a-z_]+$/)
      expect(t.description.length).toBeGreaterThan(10)
      expect(t.parameters.type).toBe('object')
    }
  })
})

describe('cleanSymbols', () => {
  it('upcases, dedupes, validates, and caps', () => {
    expect(cleanSymbols(['nvda', 'NVDA', ' amd '])).toEqual(['NVDA', 'AMD'])
    expect(cleanSymbols(['bad symbol!!!!!!!!!!!!'])).toBeNull()
    expect(cleanSymbols('NVDA')).toBeNull()
    expect(cleanSymbols([])).toBeNull()
    expect(cleanSymbols(Array.from({ length: 30 }, (_, i) => `S${i}`))).toHaveLength(15)
  })

  it('allows index/futures/fx punctuation', () => {
    expect(cleanSymbols(['^GSPC', 'ES=F', 'BRK-B', 'BTC-USD'])).toHaveLength(4)
  })
})

describe('toolLabel', () => {
  it('humanizes the verb and shows the most relevant arg', () => {
    expect(toolLabel({ name: 'get_quotes', args: { symbols: ['NVDA', 'AMD'] } })).toBe('quotes NVDA, AMD')
    expect(toolLabel({ name: 'get_technicals', args: { symbol: 'MU' } })).toBe('technicals MU')
    expect(toolLabel({ name: 'navigate', args: { view: 'heatmap' } })).toBe('open heatmap')
    expect(toolLabel({ name: 'get_watchlist', args: {} })).toBe('watchlist')
    expect(toolLabel({ name: 'future_tool', args: {} })).toBe('future_tool')
  })
})

describe('executeTool', () => {
  it('returns a JSON error for unknown tools', async () => {
    const out = JSON.parse(await executeTool('rm_rf', {}))
    expect(out.error).toMatch(/unknown tool/)
  })

  it('returns JSON errors instead of throwing on bad args', async () => {
    const out = JSON.parse(await executeTool('get_technicals', {}))
    expect(out.error).toBeTruthy()
  })

  it('get_watchlist returns the persisted list', async () => {
    const out = JSON.parse(await executeTool('get_watchlist', {}))
    expect(out.watchlist).toEqual(getWatchlist())
  })

  it('watch/unwatch mutate the real watchlist', async () => {
    const w = JSON.parse(await executeTool('watch', { symbol: 'shop' }))
    expect(w.ok).toBe(true)
    expect(getWatchlist()).toContain('SHOP')
    const dupe = JSON.parse(await executeTool('watch', { symbol: 'SHOP' }))
    expect(dupe.error).toBeTruthy()
    const uw = JSON.parse(await executeTool('unwatch', { symbol: 'SHOP' }))
    expect(uw.ok).toBe(true)
    expect(getWatchlist()).not.toContain('SHOP')
  })

  it('set_alert arms a real alert and surfaces validation errors', async () => {
    const ok = JSON.parse(await executeTool('set_alert', { symbol: 'msft', operator: '>', value: 500 }))
    expect(ok.ok).toBe(true)
    expect(ok.armed).toMatch(/MSFT price > 500/)
    expect(loadAlerts()).toHaveLength(1)

    const bad = JSON.parse(await executeTool('set_alert', { symbol: 'msft', type: 'rsi', operator: '>', value: 500 }))
    expect(bad.error).toMatch(/RSI/)
    expect(loadAlerts()).toHaveLength(1)
  })

  it('navigate sets the hash for plain views and research', async () => {
    const m = JSON.parse(await executeTool('navigate', { view: 'heatmap' }))
    expect(m.ok).toBe(true)
    expect(location.hash).toBe('#/markets/heatmap')

    const r = JSON.parse(await executeTool('navigate', { view: 'research', symbol: 'NVDA', sub: 'options' }))
    expect(r.navigatedTo).toBe('#/research/nvda/options')
    expect(location.hash).toBe('#/research/nvda/options')

    const bad = JSON.parse(await executeTool('navigate', { view: 'settings' }))
    expect(bad.error).toMatch(/unknown view/)

    const noSym = JSON.parse(await executeTool('navigate', { view: 'research' }))
    expect(noSym.error).toMatch(/symbol/)
  })
})
