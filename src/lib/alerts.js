// Price alert engine. Alerts stored in localStorage, evaluated on quote refresh.
// Alerts are recurring: firing disarms an alert (armed=false, last_fired set),
// it stays in the list until manually re-armed or deleted.

import { getItem, setItem } from './storage.js'

const STORAGE_KEY = 'price_alerts'

// Migrate legacy alerts (pre-armed schema) into current shape.
function migrate(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(a => ({
    id: a.id,
    symbol: a.symbol,
    operator: a.operator,
    value: a.value,
    ts: a.ts,
    armed: typeof a.armed === 'boolean' ? a.armed : true,
    last_fired: a.last_fired ?? null,
    fire_count: typeof a.fire_count === 'number' ? a.fire_count : 0,
  }))
}

export function loadAlerts() {
  return migrate(getItem(STORAGE_KEY, []))
}

export function addAlert(symbol, operator, value) {
  const alerts = loadAlerts()
  const alert = {
    id: alerts.length ? Math.max(...alerts.map(a => a.id)) + 1 : 1,
    symbol: symbol.toUpperCase(),
    operator, // '>', '<', '='
    value: Number(value),
    ts: new Date().toISOString(),
    armed: true,
    last_fired: null,
    fire_count: 0,
  }
  alerts.push(alert)
  setItem(STORAGE_KEY, alerts)
  return alert
}

export function removeAlert(id) {
  const alerts = loadAlerts().filter(a => a.id !== id)
  setItem(STORAGE_KEY, alerts)
}

// Toggle armed state (true = will fire, false = paused/fired-and-waiting).
export function setArmed(id, armed) {
  const alerts = loadAlerts()
  const alert = alerts.find(a => a.id === id)
  if (!alert) return null
  alert.armed = !!armed
  setItem(STORAGE_KEY, alerts)
  return alert
}

// Re-arm a fired alert. Convenience for the UI "re-arm" button.
export function clearFired(id) {
  return setArmed(id, true)
}

function matches(alert, quote) {
  if (alert.operator === '>') return quote.price > alert.value
  if (alert.operator === '<') return quote.price < alert.value
  if (alert.operator === '=') return Math.abs(quote.price - alert.value) < 0.01
  return false
}

// Evaluate all armed alerts against current quotes. Returns triggered alerts.
// Side effect: mutates matching alerts to armed=false, updates last_fired + fire_count.
export function evaluateAlerts(quotes) {
  if (!quotes?.length) return []
  const alerts = loadAlerts()
  const triggered = []
  const now = new Date().toISOString()

  for (const alert of alerts) {
    if (!alert.armed) continue
    const quote = quotes.find(q => q.symbol === alert.symbol)
    if (!quote) continue
    if (matches(alert, quote)) {
      alert.armed = false
      alert.last_fired = now
      alert.fire_count = (alert.fire_count || 0) + 1
      triggered.push(alert)
    }
  }

  if (triggered.length) setItem(STORAGE_KEY, alerts)
  return triggered
}
