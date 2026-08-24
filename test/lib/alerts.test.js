import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadAlerts, addAlert, removeAlert, markTriggered, rearmAlert,
  setAlertDelivery, updateAlert, onAlertsChange,
  evaluatePriceAlerts, evaluateTechnicalAlerts, conditionText, conditionDetail,
} from '../../src/lib/alerts.js'
import { ALERT_RECIPES } from '../../src/pages/alerts.jsx'

beforeEach(() => localStorage.clear())

describe('addAlert / removeAlert', () => {
  it('the empty-book shortcuts create supported alert conditions', () => {
    for (const recipe of ALERT_RECIPES) {
      expect(() => addAlert({ symbol: 'MSFT', type: recipe.type, operator: recipe.operator, value: 1 })).not.toThrow()
    }
    expect(loadAlerts()).toHaveLength(ALERT_RECIPES.length)
  })

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
    const deliveryId = a.deliveryId
    markTriggered(a.id, 1.5)
    let stored = loadAlerts()[0]
    expect(stored.triggered).toBeTruthy()
    expect(stored.current).toBeCloseTo(1.5)
    rearmAlert(a.id)
    stored = loadAlerts()[0]
    expect(stored.triggered).toBeNull()
    expect(stored.deliveryId).not.toBe(deliveryId)
    expect(stored.deliveryStatus).toBeNull()
  })

  it('does not let delivery settings change after an alert fired', () => {
    const a = addAlert({ symbol: 'A', type: 'price', operator: '>', value: 1 })
    markTriggered(a.id, 1.5)
    expect(setAlertDelivery(a.id, { enabled: true, destination: 'desk' })).toBe(false)
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

describe('updateAlert', () => {
  const seed = (over = {}) =>
    addAlert({ symbol: 'MSFT', type: 'price', operator: '>', value: 500, ...over })

  it('edits the condition in place, keeping id/created/order', () => {
    const first = seed()
    const second = addAlert({ symbol: 'AAPL', type: 'price', operator: '<', value: 200 })
    const out = updateAlert(first.id, { symbol: 'nvda', operator: '<', value: 120 })
    expect(out.id).toBe(first.id)
    expect(out.symbol).toBe('NVDA')
    expect(out.operator).toBe('<')
    expect(out.value).toBe(120)
    expect(out.created).toBe(first.created)
    const stored = loadAlerts()
    expect(stored.map((a) => a.id)).toEqual([first.id, second.id])
    expect(stored[0].symbol).toBe('NVDA')
  })

  it('returns null for an unknown id and leaves storage untouched', () => {
    seed()
    expect(updateAlert(999, { value: 1 })).toBeNull()
    expect(loadAlerts()[0].value).toBe(500)
  })

  it('validates the merged alert like addAlert', () => {
    const a = seed()
    expect(() => updateAlert(a.id, { symbol: '  ' })).toThrow()
    expect(() => updateAlert(a.id, { type: 'nope' })).toThrow()
    expect(() => updateAlert(a.id, { operator: '=' })).toThrow()
    expect(() => updateAlert(a.id, { value: 'abc' })).toThrow()
    expect(() => updateAlert(a.id, { type: 'rsi', value: 150 })).toThrow()
    expect(() => updateAlert(a.id, { type: 'sma_cross', value: 1.5 })).toThrow()
    // a rejected edit must not have half-written the alert
    expect(loadAlerts()[0].value).toBe(500)
  })

  it('normalizes a switch to volume onto the > operator', () => {
    const a = seed({ operator: '<' })
    expect(updateAlert(a.id, { type: 'volume', value: 2 }).operator).toBe('>')
  })

  it('preserves delivery settings and deliveryId across an edit', () => {
    const a = seed({ delivery: { enabled: true, destination: 'desk', maxPerHour: 3 } })
    const out = updateAlert(a.id, { value: 600 })
    expect(out.delivery).toEqual({ enabled: true, destination: 'desk', maxPerHour: 3 })
    expect(out.deliveryId).toBe(a.deliveryId)
  })

  it('re-arms a triggered alert when the condition changes', () => {
    const a = seed()
    markTriggered(a.id, 510)
    const out = updateAlert(a.id, { value: 600 })
    expect(out.triggered).toBeNull()
    expect(out.current).toBeNull()
    expect(out.deliveryStatus).toBeNull()
    expect(out.deliveryId).not.toBe(a.deliveryId)
  })

  it('leaves a triggered alert triggered when the edit is a no-op', () => {
    const a = seed()
    markTriggered(a.id, 510)
    const out = updateAlert(a.id, { symbol: 'msft', value: 500 })
    expect(out.triggered).toBeTruthy()
    expect(out.current).toBe(510)
    expect(out.deliveryId).toBe(a.deliveryId)
  })

  it('notifies subscribers', () => {
    const a = seed()
    let hits = 0
    const off = onAlertsChange(() => { hits += 1 })
    updateAlert(a.id, { value: 501 })
    off()
    expect(hits).toBe(1)
  })
})

describe('conditionText', () => {
  it('renders human-readable conditions', () => {
    expect(conditionText({ symbol: 'MSFT', type: 'price', operator: '>', value: 500 })).toBe('MSFT price > 500')
    expect(conditionText({ symbol: 'MSFT', type: 'rsi', operator: '<', value: 30 })).toBe('MSFT RSI < 30')
    expect(conditionText({ symbol: 'MSFT', type: 'sma_cross', operator: '>', value: 50 })).toBe('MSFT crosses above SMA50')
    expect(conditionText({ symbol: 'MSFT', type: 'volume', operator: '>', value: 2 })).toBe('MSFT volume > 2x avg')
  })

  it('conditionDetail drops the symbol so the UI can link it separately', () => {
    expect(conditionDetail({ symbol: 'MSFT', type: 'price', operator: '>', value: 500 })).toBe('price > 500')
    expect(conditionDetail({ symbol: 'MSFT', type: 'rsi', operator: '<', value: 30 })).toBe('RSI < 30')
    expect(conditionDetail({ symbol: 'MSFT', type: 'sma_cross', operator: '<', value: 50 })).toBe('crosses below SMA50')
    expect(conditionDetail({ symbol: 'MSFT', type: 'volume', operator: '>', value: 2 })).toBe('volume > 2x avg')
    // the old slice(symbol.length + 1) hack broke on symbols the text repeats
    const brk = { symbol: 'BRK.B', type: 'price', operator: '>', value: 400 }
    expect(conditionText(brk)).toBe(`${brk.symbol} ${conditionDetail(brk)}`)
  })
})
