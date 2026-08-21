import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKET_VISUAL,
  DEFAULT_MARKET_VISUAL_WINDOW,
  MARKET_VISUALS,
  MARKET_VISUAL_WINDOWS,
  loadMarketVisualPrefs,
  saveMarketVisualPrefs,
} from '../../src/lib/marketVisuals.js'

beforeEach(() => localStorage.clear())

describe('market overview visual preference', () => {
  it('offers the session meter and the shared spark readings', () => {
    expect(MARKET_VISUALS.map((item) => item.id)).toEqual([
      'session', 'area', 'line', 'base', 'vol', 'chg', 'range', 'off',
    ])
    expect(MARKET_VISUALS.find((item) => item.id === DEFAULT_MARKET_VISUAL)).toBeTruthy()
  })

  it('only offers daily-history windows that the markets page already has', () => {
    expect(MARKET_VISUAL_WINDOWS.map((item) => item.id)).toEqual(['1M', '3M', '6M', '1Y'])
    expect(MARKET_VISUAL_WINDOWS.find((item) => item.id === DEFAULT_MARKET_VISUAL_WINDOW)).toBeTruthy()
  })

  it('loads valid saved choices and rejects stale garbage', () => {
    localStorage.setItem('markets_visual_v1', 'line')
    localStorage.setItem('markets_visual_window_v1', '1Y')
    expect(loadMarketVisualPrefs(localStorage)).toEqual({ visual: 'line', window: '1Y' })

    localStorage.setItem('markets_visual_v1', 'candles')
    localStorage.setItem('markets_visual_window_v1', 'DAY')
    expect(loadMarketVisualPrefs(localStorage)).toEqual({
      visual: DEFAULT_MARKET_VISUAL,
      window: DEFAULT_MARKET_VISUAL_WINDOW,
    })
  })

  it('persists one whole-board choice without throwing on unavailable storage', () => {
    saveMarketVisualPrefs(localStorage, { visual: 'area', window: '3M' })
    expect(localStorage.getItem('markets_visual_v1')).toBe('area')
    expect(localStorage.getItem('markets_visual_window_v1')).toBe('3M')
    expect(() => saveMarketVisualPrefs(null, { visual: 'line', window: '6M' })).not.toThrow()
  })
})
