import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, render } from 'preact'
import { act } from 'preact/test-utils'

const feed = vi.hoisted(() => ({ active: new Set(), track: vi.fn() }))
vi.mock('../../src/lib/feed.js', async (original) => ({
  ...await original(),
  track: feed.track,
  follow: (symbols) => {
    for (const symbol of symbols) feed.active.add(symbol)
    return () => { for (const symbol of symbols) feed.active.delete(symbol) }
  },
  subscribe: () => () => {},
}))
import { prefetchSymbol } from '../../src/lib/history.js'
import { useAlertEngine } from '../../src/hooks.js'
import { addAlert, markTriggered } from '../../src/lib/alerts.js'

let root
function Alerts() { useAlertEngine(); return null }
afterEach(() => {
  if (root) act(() => render(null, root))
  root?.remove()
  root = null
  localStorage.clear()
  feed.active.clear()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('feed consumer lifetimes', () => {
  it('hovering hundreds of symbols does not create permanent feed subscriptions', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline fixture')))
    for (let i = 0; i < 500; i++) prefetchSymbol(`EXAMPLE${i}`)
    expect(feed.track).not.toHaveBeenCalled()
  })

  it('releases triggered alerts and every subscription when the engine unmounts', () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline fixture')))
    const alert = addAlert({ symbol: 'AAPL', type: 'price', operator: '>', value: 200 })
    root = document.createElement('div')
    document.body.append(root)
    act(() => render(h(Alerts), root))
    expect([...feed.active]).toEqual(['AAPL'])
    act(() => markTriggered(alert.id, 201))
    expect([...feed.active]).toEqual([])
    act(() => addAlert({ symbol: 'MSFT', type: 'price', operator: '>', value: 400 }))
    expect([...feed.active]).toEqual(['MSFT'])
    act(() => render(null, root))
    expect([...feed.active]).toEqual([])
  })
})
