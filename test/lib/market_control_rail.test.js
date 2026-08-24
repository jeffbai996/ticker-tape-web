import { h, render } from 'preact'
import { afterEach, describe, expect, it } from 'vitest'
import { MarketControlRail } from '../../src/pages/markets.jsx'
import { COMMODITY_GROUPS } from '../../src/lib/markets.js'

let host
afterEach(() => {
  if (host) render(null, host)
  host?.remove()
  host = null
})

describe('market control rail', () => {
  it('renders as a labeled toolbar with the supplied market groups', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    render(h(MarketControlRail, {
      groups: COMMODITY_GROUPS,
      visual: 'session',
      window: '3M',
      onVisual: () => {},
      onWindow: () => {},
    }), host)

    const rail = host.querySelector('[data-market-controls]')
    expect(rail).not.toBeNull()
    expect(rail.getAttribute('aria-label')).toBe('Market controls')
    expect([...rail.querySelectorAll('[data-market-group-target]')].map((el) => el.textContent))
      .toEqual(COMMODITY_GROUPS.map((group) => group.name))
    expect(rail.querySelector('[aria-label="Row visual"]')).not.toBeNull()
  })
})
