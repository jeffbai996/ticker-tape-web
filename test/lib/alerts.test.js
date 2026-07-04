import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadAlerts, addAlert, removeAlert, markTriggered, rearmAlert,
  evaluatePriceAlerts, evaluateTechnicalAlerts, conditionText,
} from '../../src/lib/alerts.js'

beforeEach(() => localStorage.clear())

describe('addAlert / removeAlert', () => {
  it('persists a valid price alert with uppercase symbol and next id', () => {
    const a = addAlert({ symbol: 'msft', type: 'price', operator: '>', value: 500 })
    expect(a.symbol).toBe('MSFT')
    expect(a.id).toBe(1)
    expect(typeof a.created).toBe('number') // epoch ms, JSON-safe
    const b = addAlert({ symbol: 'AAPL', type: 'price', operator: '<', value: 200 })
    expect(b.id).toBe(2)
    expect(loadAlerts()).toHaveLength(2)
  })

  it('rejects invalid input', () => {
    expect(() => addAlert({ symbol: '', type: 'price', operator: '>', value: 1 })).toThrow()
    expect(() => addAlert({ symbol: 'A', type: 'nope', operator: '>', value: 1 })).toThrow()
    expect(() => addAlert({ symbol: 'A', type: 'price', operator: '=', value: 1 })).toThrow()
    expect(() => addAlert({ symbol: 'A', type: 'price', operator: '>', value: NaN })).toThrow()
    expect(() => addAlert({ symbol: 'A', type: 'rsi', operator: '>', value: 150 })).toThrow()
    expect(() => addAlert({ symbol: 'A', type: 'sma_cross', operator: '>', value: 1.5 })).toThrow()
  })

  it('normalizes volume alerts to the > operator', () => {
    const a = addAlert({ symbol: 'A', type: 'volume', operator: '<', value: 2 })
    expect(a.operator).toBe('>')
  })

  it('removes by id', () => {
    const a = addAlert({ symbol: 'A', type: 'price', operator: '>', value: 1 })
    expect(removeAlert(a.id)).toBe(true)
    expect(removeAlert(999)).toBe(false)
    expect(loadAlerts()).toHaveLength(0)
  })
})

describe('trigger lifecycle', () => {
  it('marks triggered with the observed value and re-arms', () => {
    const a = addAlert({ symbol: 'A', type: 'price', operator: '>', value: 1 })
    markTriggered(a.id, 1.5)
    let stored = loadAlerts()[0]
    expect(stored.triggered).toBeTruthy()
    expect(stored.current).toBeCloseTo(1.5)
    rearmAlert(a.id)
    stored = loadAlerts()[0]
    expect(stored.triggered).toBeNull()
  })
})

describe('evaluatePriceAlerts', () => {
  const armed = (over) => ({ id: 1, symbol: 'MSFT', type: 'price', operator: '>', value: 500, triggered: null, ...over })

  it('triggers > and < correctly', () => {
    expect(evaluatePriceAlerts([armed()], { MSFT: 510 })).toHaveLength(1)
    expect(evaluatePriceAlerts([armed()], { MSFT: 490 })).toHaveLength(0)
    expect(evaluatePriceAlerts([armed({ operator: '<', value: 500 })], { MSFT: 490 })).toHaveLength(1)
  })

  it('includes the current price on the triggered alert', () => {
    const [t] = evaluatePriceAlerts([armed()], { MSFT: 510 })
    expect(t.current).toBe(510)
  })

  it('skips already-triggered alerts, other types, and missing prices', () => {
    expect(evaluatePriceAlerts([armed({ triggered: 123 })], { MSFT: 510 })).toHaveLength(0)
    expect(evaluatePriceAlerts([armed({ type: 'rsi' })], { MSFT: 510 })).toHaveLength(0)
    expect(evaluatePriceAlerts([armed()], {})).toHaveLength(0)
  })
})

describe('evaluateTechnicalAlerts', () => {
  const tech = { MSFT: { rsi: 75, current: 510, smas: { 50: 480 }, volRatio: 2.5 } }

  it('triggers rsi threshold alerts', () => {
    const a = { id: 1, symbol: 'MSFT', type: 'rsi', operator: '>', value: 70, triggered: null }
    const out = evaluateTechnicalAlerts([a], tech)
    expect(out).toHaveLength(1)
    expect(out[0].current).toBe(75)
  })

  it('triggers sma_cross using value as the window', () => {
    const a = { id: 1, symbol: 'MSFT', type: 'sma_cross', operator: '>', value: 50, triggered: null }
    expect(evaluateTechnicalAlerts([a], tech)).toHaveLength(1)
    const below = { id: 2, symbol: 'MSFT', type: 'sma_cross', operator: '<', value: 50, triggered: null }
    expect(evaluateTechnicalAlerts([below], tech)).toHaveLength(0)
  })

  it('triggers volume ratio alerts', () => {
    const a = { id: 1, symbol: 'MSFT', type: 'volume', operator: '>', value: 2, triggered: null }
    expect(evaluateTechnicalAlerts([a], tech)).toHaveLength(1)
  })

  it('skips price alerts, missing tech data, and unknown SMA windows', () => {
    const price = { id: 1, symbol: 'MSFT', type: 'price', operator: '>', value: 1, triggered: null }
    expect(evaluateTechnicalAlerts([price], tech)).toHaveLength(0)
    const other = { id: 2, symbol: 'AAPL', type: 'rsi', operator: '>', value: 1, triggered: null }
    expect(evaluateTechnicalAlerts([other], tech)).toHaveLength(0)
    const sma = { id: 3, symbol: 'MSFT', type: 'sma_cross', operator: '>', value: 200, triggered: null }
    expect(evaluateTechnicalAlerts([sma], tech)).toHaveLength(0)
  })
})

describe('conditionText', () => {
  it('renders human-readable conditions', () => {
    expect(conditionText({ symbol: 'MSFT', type: 'price', operator: '>', value: 500 })).toBe('MSFT price > 500')
    expect(conditionText({ symbol: 'MSFT', type: 'rsi', operator: '<', value: 30 })).toBe('MSFT RSI < 30')
    expect(conditionText({ symbol: 'MSFT', type: 'sma_cross', operator: '>', value: 50 })).toBe('MSFT crosses above SMA50')
    expect(conditionText({ symbol: 'MSFT', type: 'volume', operator: '>', value: 2 })).toBe('MSFT volume > 2x avg')
  })
})
