// Price/technical alerts, CLI-parity: price, rsi, sma_cross, volume.
// One-shot semantics: a triggered alert stays triggered (with the observed
// value) until re-armed or deleted, so a 60s feed doesn't refire it forever.
// sma_cross stores the SMA *window* in value (50 = SMA50), matching the CLI.

const KEY = 'alerts_v1'
const TYPES = new Set(['price', 'rsi', 'sma_cross', 'volume'])

const listeners = new Set()

/** Subscribe to any alert mutation (add/remove/trigger/rearm). */
export function onAlertsChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function emit() {
  for (const fn of listeners) fn()
}

export function loadAlerts() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || []
  } catch {
    return []
  }
}

function save(alerts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(alerts))
  } catch { /* quota — alerts are best-effort */ }
  emit()
}

export function addAlert({ symbol, type, operator, value }) {
  const sym = (symbol || '').trim().toUpperCase()
  if (!sym) throw new Error('symbol required')
  if (!TYPES.has(type)) throw new Error(`unknown alert type: ${type}`)
  if (type === 'volume') operator = '>' // ratio below threshold is meaningless
  if (operator !== '>' && operator !== '<') throw new Error('operator must be > or <')
  const v = Number(value)
  if (!Number.isFinite(v)) throw new Error('value must be a number')
  if (type === 'rsi' && (v < 0 || v > 100)) throw new Error('RSI must be 0-100')
  if (type === 'sma_cross' && (!Number.isInteger(v) || v < 2)) throw new Error('SMA window must be an integer ≥ 2')

  const alerts = loadAlerts()
  const alert = {
    id: Math.max(0, ...alerts.map((a) => a.id)) + 1,
    symbol: sym,
    type,
    operator,
    value: v,
    created: Date.now(),
    triggered: null,
    current: null,
  }
  save([...alerts, alert])
  return alert
}

export function removeAlert(id) {
  const alerts = loadAlerts()
  const next = alerts.filter((a) => a.id !== id)
  if (next.length === alerts.length) return false
  save(next)
  return true
}

export function markTriggered(id, current) {
  save(loadAlerts().map((a) => (a.id === id ? { ...a, triggered: Date.now(), current } : a)))
}

export function rearmAlert(id) {
  save(loadAlerts().map((a) => (a.id === id ? { ...a, triggered: null, current: null } : a)))
}

/** Armed price alerts against a {SYM: price} map. Returns hits with `current`. */
export function evaluatePriceAlerts(alerts, priceMap) {
  const out = []
  for (const a of alerts) {
    if (a.type !== 'price' || a.triggered) continue
    const price = priceMap[a.symbol]
    if (price == null) continue
    if ((a.operator === '>' && price > a.value) || (a.operator === '<' && price < a.value)) {
      out.push({ ...a, current: price })
    }
  }
  return out
}

/** Armed rsi/sma_cross/volume alerts against {SYM: {rsi, current, smas, volRatio}}. */
export function evaluateTechnicalAlerts(alerts, techMap) {
  const out = []
  for (const a of alerts) {
    if (a.type === 'price' || a.triggered) continue
    const t = techMap[a.symbol]
    if (!t) continue

    if (a.type === 'rsi' && t.rsi != null) {
      if ((a.operator === '>' && t.rsi > a.value) || (a.operator === '<' && t.rsi < a.value)) {
        out.push({ ...a, current: t.rsi })
      }
    } else if (a.type === 'sma_cross') {
      const sma = t.smas?.[a.value]
      if (sma == null || t.current == null) continue
      if ((a.operator === '>' && t.current > sma) || (a.operator === '<' && t.current < sma)) {
        out.push({ ...a, current: t.current })
      }
    } else if (a.type === 'volume' && t.volRatio != null) {
      if (t.volRatio > a.value) out.push({ ...a, current: t.volRatio })
    }
  }
  return out
}

export function conditionText(a) {
  if (a.type === 'rsi') return `${a.symbol} RSI ${a.operator} ${a.value}`
  if (a.type === 'sma_cross') return `${a.symbol} crosses ${a.operator === '>' ? 'above' : 'below'} SMA${a.value}`
  if (a.type === 'volume') return `${a.symbol} volume > ${a.value}x avg`
  return `${a.symbol} price ${a.operator} ${a.value}`
}
