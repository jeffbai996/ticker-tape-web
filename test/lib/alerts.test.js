import { describe, it, expect, beforeEach } from 'vitest'
import { loadAlerts, addAlert, removeAlert, evaluateAlerts } from '../../src/lib/alerts.js'

// localStorage is cleared in test/setup.js before each test

describe('loadAlerts', () => {
  it('returns empty array when no alerts stored', () => {
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

  it('removes triggered alerts (fire-once)', () => {
    addAlert('NVDA', '>', 150)
    evaluateAlerts(quotes)
    expect(loadAlerts()).toHaveLength(0)
  })

  it('leaves un-triggered alerts intact', () => {
    addAlert('NVDA', '>', 150) // fires
    addAlert('NVDA', '>', 200) // does not fire
    evaluateAlerts(quotes)
    expect(loadAlerts()).toHaveLength(1)
    expect(loadAlerts()[0].value).toBe(200)
  })

  it('skips symbols not in quotes', () => {
    addAlert('TSLA', '>', 100)
    expect(evaluateAlerts(quotes)).toHaveLength(0)
    // Alert should still be in storage (wasn't triggered, wasn't removed)
    expect(loadAlerts()).toHaveLength(1)
  })

  it('handles multiple simultaneous triggers', () => {
    addAlert('NVDA', '>', 150)
    addAlert('AAPL', '<', 180)
    const triggered = evaluateAlerts(quotes)
    expect(triggered).toHaveLength(2)
    expect(loadAlerts()).toHaveLength(0)
  })
})
