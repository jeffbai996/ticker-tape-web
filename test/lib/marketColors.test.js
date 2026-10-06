import { describe, expect, it } from 'vitest'
import {
  applyMarketColorOrder,
  defaultMarketColorOrder,
  getMarketColorOrder,
  oppositeMarketColorOrder,
  saveMarketColorOrder,
} from '../../src/lib/marketColors.js'

function memory(seed = {}) {
  const values = new Map(Object.entries(seed))
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

describe('market gain/loss color convention', () => {
  it('defaults to global colors', () => {
    expect(defaultMarketColorOrder()).toBe('global')
    expect(getMarketColorOrder(memory())).toBe('global')
  })

  it('honors a saved override', () => {
    expect(getMarketColorOrder(memory({ ttw_market_color_order_v1: 'cn' }))).toBe('cn')
    expect(getMarketColorOrder(memory({ ttw_market_color_order_v1: 'global' }))).toBe('global')
  })

  it('persists and paints a switch as one operation', () => {
    const store = memory()
    const root = { dataset: {} }
    expect(saveMarketColorOrder('cn', store, root)).toBe('cn')
    expect(root.dataset.marketColors).toBe('cn')
    expect(getMarketColorOrder(store, false)).toBe('cn')
    expect(oppositeMarketColorOrder('cn')).toBe('global')
    expect(applyMarketColorOrder('bogus', root)).toBe('global')
  })
})
