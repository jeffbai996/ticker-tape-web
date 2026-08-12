import { SPARK_TYPES, SPARK_WINDOWS } from './sparks.js'

export const MARKET_VISUALS = [
  { id: 'session', label: 'Session range' },
  ...SPARK_TYPES,
]

export const DEFAULT_MARKET_VISUAL = 'session'
export const MARKET_VISUAL_WINDOWS = SPARK_WINDOWS.filter((item) => item.id !== 'DAY')
export const DEFAULT_MARKET_VISUAL_WINDOW = '3M'

const isVisual = (id) => MARKET_VISUALS.some((item) => item.id === id)
const isWindow = (id) => MARKET_VISUAL_WINDOWS.some((item) => item.id === id)

export function loadMarketVisualPrefs(storage = globalThis.localStorage) {
  try {
    const visual = storage?.getItem('markets_visual_v1')
    const window = storage?.getItem('markets_visual_window_v1')
    return {
      visual: isVisual(visual) ? visual : DEFAULT_MARKET_VISUAL,
      window: isWindow(window) ? window : DEFAULT_MARKET_VISUAL_WINDOW,
    }
  } catch {
    return { visual: DEFAULT_MARKET_VISUAL, window: DEFAULT_MARKET_VISUAL_WINDOW }
  }
}

export function saveMarketVisualPrefs(storage = globalThis.localStorage, prefs = {}) {
  try {
    storage?.setItem('markets_visual_v1',
      isVisual(prefs.visual) ? prefs.visual : DEFAULT_MARKET_VISUAL)
    storage?.setItem('markets_visual_window_v1',
      isWindow(prefs.window) ? prefs.window : DEFAULT_MARKET_VISUAL_WINDOW)
  } catch { /* a private/locked-down browser can keep the in-memory choice */ }
}
