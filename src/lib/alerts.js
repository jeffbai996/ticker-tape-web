// Price alert engine. Alerts stored in localStorage, evaluated on quote refresh.

import { getItem, setItem } from './storage.js'

const STORAGE_KEY = 'price_alerts'

export function loadAlerts() {
  return getItem(STORAGE_KEY, [])
}

export function addAlert(symbol, operator, value) {
  const alerts = loadAlerts()
  const alert = {
    id: alerts.length ? Math.max(...alerts.map(a => a.id)) + 1 : 1,
    symbol: symbol.toUpperCase(),
    operator, // '>', '<', '='
    value: Number(value),
    ts: new Date().toISOString(),
  }
  alerts.push(alert)
  setItem(STORAGE_KEY, alerts)
  return alert
}

export function removeAlert(id) {
  const alerts = loadAlerts().filter(a => a.id !== id)
  setItem(STORAGE_KEY, alerts)
}

export function evaluateAlerts(quotes) {
  if (!quotes?.length) return []
  const alerts = loadAlerts()
  const triggered = []

  for (const alert of alerts) {
    const quote = quotes.find(q => q.symbol === alert.symbol)
    if (!quote) continue

    let fired = false
    if (alert.operator === '>' && quote.price > alert.value) fired = true
    if (alert.operator === '<' && quote.price < alert.value) fired = true
    if (alert.operator === '=' && Math.abs(quote.price - alert.value) < 0.01) fired = true

    if (fired) {
      triggered.push(alert)
    }
  }

  // Remove triggered alerts (fire-once)
  if (triggered.length) {
    const ids = new Set(triggered.map(a => a.id))
    const remaining = alerts.filter(a => !ids.has(a.id))
    setItem(STORAGE_KEY, remaining)
  }

  return triggered
}
