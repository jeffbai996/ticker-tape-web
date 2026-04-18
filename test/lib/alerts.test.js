import { describe, it, expect } from 'vitest'
import {
  loadAlerts, addAlert, removeAlert, evaluateAlerts,
  setArmed, clearFired,
} from '../../src/lib/alerts.js'

// localStorage is cleared in test/setup.js before each test

describe('loadAlerts', () => {
  it('returns empty array when no alerts stored', () => {
    expect(loadAlerts()).toEqual([])
  })

  it('migrates legacy alerts (no armed field) to armed=true', () => {
    // Legacy schema: no armed/last_fired/fire_count
    localStorage.setItem('price_alerts', JSON.stringify([
      { id: 1, symbol: 'NVDA', operator: '>', value: 100, ts: '2026-01-01T00:00:00Z' },
    ]))
    const alerts = loadAlerts()
    expect(alerts).toHaveLength(1)
    expect(alerts[0].armed).toBe(true)
    expect(alerts[0].last_fired).toBeNull()
    expect(alerts[0].fire_count).toBe(0)
  })

  it('preserves explicit armed=false on migration', () => {
    localStorage.setItem('price_alerts', JSON.stringify([
      { id: 1, symbol: 'NVDA', operator: '>', value: 100, ts: 'x', armed: false, last_fired: 'y', fire_count: 2 },
    ]))
    const a = loadAlerts()[0]
    expect(a.armed).toBe(false)
    expect(a.last_fired).toBe('y')
    expect(a.fire_count).toBe(2)
  })

  it('returns empty array when storage is corrupt', () => {
    localStorage.setItem('price_alerts', 'not-json-at-all')
    expect(loadAlerts()).toEqual([])
  })
})

describe('addAlert', () => {
  it('adds alert and returns it', () => {
    const a = addAlert('NVDA', '>', 150)
    expect(a.symbol).toBe('NVDA')
    expect(a.operator).toBe('>')
    expect(a.value).toBe(150)
    expect(a.id).toBe(1)
  })
  it('uppercases symbol', () => {
    const a = addAlert('nvda', '>', 100)
    expect(a.symbol).toBe('NVDA')
  })
  it('coerces value to number', () => {
    const a = addAlert('AAPL', '<', '180')
    expect(typeof a.value).toBe('number')
    expect(a.value).toBe(180)
  })
  it('increments id for each new alert', () => {
    const a1 = addAlert('NVDA', '>', 100)
    const a2 = addAlert('AAPL', '<', 200)
    expect(a2.id).toBe(a1.id + 1)
  })
  it('sets a timestamp', () => {
    const a = addAlert('NVDA', '>', 100)
    expect(a.ts).toBeTruthy()
    expect(new Date(a.ts).getFullYear()).toBeGreaterThan(2020)
  })
  it('starts armed with null last_fired and zero fire_count', () => {
    const a = addAlert('NVDA', '>', 100)
    expect(a.armed).toBe(true)
    expect(a.last_fired).toBeNull()
    expect(a.fire_count).toBe(0)
  })
  it('persists alert in storage', () => {
    addAlert('NVDA', '>', 100)
    expect(loadAlerts()).toHaveLength(1)
  })
})

describe('removeAlert', () => {
  it('removes alert by id', () => {
    const a = addAlert('NVDA', '>', 100)
    removeAlert(a.id)
    expect(loadAlerts()).toHaveLength(0)
  })
  it('leaves other alerts intact', () => {
    const a1 = addAlert('NVDA', '>', 100)
    const a2 = addAlert('AAPL', '<', 200)
    removeAlert(a1.id)
    const remaining = loadAlerts()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(a2.id)
  })
  it('does nothing for non-existent id', () => {
    addAlert('NVDA', '>', 100)
    removeAlert(9999)
    expect(loadAlerts()).toHaveLength(1)
  })
})

describe('setArmed / clearFired', () => {
  it('setArmed flips armed flag and persists', () => {
    const a = addAlert('NVDA', '>', 100)
    setArmed(a.id, false)
    expect(loadAlerts()[0].armed).toBe(false)
    setArmed(a.id, true)
    expect(loadAlerts()[0].armed).toBe(true)
  })
  it('clearFired re-arms an alert', () => {
    const a = addAlert('NVDA', '>', 150)
    evaluateAlerts([{ symbol: 'NVDA', price: 160 }]) // fires -> armed=false
    expect(loadAlerts()[0].armed).toBe(false)
    clearFired(a.id)
    expect(loadAlerts()[0].armed).toBe(true)
  })
  it('returns null for non-existent id', () => {
    expect(setArmed(9999, true)).toBeNull()
  })
})

describe('evaluateAlerts', () => {
  const quotes = [
    { symbol: 'NVDA', price: 160 },
    { symbol: 'AAPL', price: 175 },
  ]

  it('returns empty array for no quotes', () => {
    addAlert('NVDA', '>', 100)
    expect(evaluateAlerts(null)).toEqual([])
    expect(evaluateAlerts([])).toEqual([])
  })

  it('fires > alert when price is above threshold', () => {
    addAlert('NVDA', '>', 150)
    const triggered = evaluateAlerts(quotes)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].symbol).toBe('NVDA')
  })

  it('does not fire > alert when price is below threshold', () => {
    addAlert('NVDA', '>', 200)
    expect(evaluateAlerts(quotes)).toHaveLength(0)
  })

  it('fires < alert when price is below threshold', () => {
    addAlert('AAPL', '<', 180)
    const triggered = evaluateAlerts(quotes)
    expect(triggered).toHaveLength(1)
    expect(triggered[0].symbol).toBe('AAPL')
  })

  it('does not fire < alert when price is above threshold', () => {
    addAlert('AAPL', '<', 170)
    expect(evaluateAlerts(quotes)).toHaveLength(0)
  })

  it('fires = alert within 0.01 tolerance', () => {
    addAlert('NVDA', '=', 160.005)
    const triggered = evaluateAlerts(quotes)
    expect(triggered).toHaveLength(1)
  })

  it('does not fire = alert outside tolerance', () => {
    addAlert('NVDA', '=', 160.02)
    expect(evaluateAlerts(quotes)).toHaveLength(0)
  })

  it('disarms triggered alerts instead of deleting', () => {
    addAlert('NVDA', '>', 150)
    evaluateAlerts(quotes)
    const stored = loadAlerts()
    expect(stored).toHaveLength(1)
    expect(stored[0].armed).toBe(false)
    expect(stored[0].last_fired).toBeTruthy()
    expect(stored[0].fire_count).toBe(1)
  })

  it('does not re-fire a disarmed alert', () => {
    addAlert('NVDA', '>', 150)
    evaluateAlerts(quotes) // first fire
    const second = evaluateAlerts(quotes)
    expect(second).toHaveLength(0)
    // still disarmed, fire_count unchanged
    expect(loadAlerts()[0].fire_count).toBe(1)
  })

  it('re-arms via clearFired then fires again, incrementing fire_count', () => {
    const a = addAlert('NVDA', '>', 150)
    evaluateAlerts(quotes)
    clearFired(a.id)
    evaluateAlerts(quotes)
    expect(loadAlerts()[0].fire_count).toBe(2)
  })

  it('leaves un-triggered alerts intact', () => {
    addAlert('NVDA', '>', 150) // fires
    addAlert('NVDA', '>', 200) // does not fire
    evaluateAlerts(quotes)
    const stored = loadAlerts()
    expect(stored).toHaveLength(2)
    const unfired = stored.find(a => a.value === 200)
    expect(unfired.armed).toBe(true)
    expect(unfired.fire_count).toBe(0)
  })

  it('skips symbols not in quotes', () => {
    addAlert('TSLA', '>', 100)
    expect(evaluateAlerts(quotes)).toHaveLength(0)
    expect(loadAlerts()).toHaveLength(1)
    expect(loadAlerts()[0].armed).toBe(true)
  })

  it('handles multiple simultaneous triggers', () => {
    addAlert('NVDA', '>', 150)
    addAlert('AAPL', '<', 180)
    const triggered = evaluateAlerts(quotes)
    expect(triggered).toHaveLength(2)
    const stored = loadAlerts()
    expect(stored).toHaveLength(2)
    expect(stored.every(a => !a.armed)).toBe(true)
  })
})
