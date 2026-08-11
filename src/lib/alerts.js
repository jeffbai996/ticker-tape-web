// Price/technical alerts, CLI-parity: price, rsi, sma_cross, volume.
// One-shot semantics: a triggered alert stays triggered (with the observed
// value) until re-armed or deleted, so a 60s feed doesn't refire it forever.
// sma_cross stores the SMA *window* in value (50 = SMA50), matching the CLI.

const KEY = 'alerts_v1'
const DELIVERY_PREFS_KEY = 'alert_delivery_prefs_v1'
const TYPES = new Set(['price', 'rsi', 'sma_cross', 'volume'])
const DEFAULT_DELIVERY = { enabled: false, destination: '', maxPerHour: 6 }

const listeners = new Set()

function newDeliveryId(created, id) {
  const uuid = globalThis.crypto?.randomUUID?.()
  return uuid
    ? `alert-${uuid}`
    : `alert-${created}-${id}-${Math.random().toString(36).slice(2)}`
}

function normalizeDelivery(value = {}) {
  const max = Number(value.maxPerHour)
  return {
    enabled: value.enabled === true,
    destination: String(value.destination || '').trim(),
    maxPerHour: Number.isInteger(max) ? Math.max(1, Math.min(60, max)) : 6,
  }
}

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

export function getAlertDeliveryPrefs() {
  try {
    return normalizeDelivery(JSON.parse(localStorage.getItem(DELIVERY_PREFS_KEY)) || DEFAULT_DELIVERY)
  } catch {
    return { ...DEFAULT_DELIVERY }
  }
}

export function setAlertDeliveryPrefs(value) {
  const prefs = normalizeDelivery(value)
  try { localStorage.setItem(DELIVERY_PREFS_KEY, JSON.stringify(prefs)) } catch { /* best-effort */ }
  return prefs
}

function save(alerts) {
  try {
    localStorage.setItem(KEY, JSON.stringify(alerts))
  } catch { /* quota — alerts are best-effort */ }
  emit()
}

/** Validate + normalize the condition half of an alert. Throws on bad input;
 *  add and update share it so an edit can never write a shape add would reject. */
function normalizeCondition({ symbol, type, operator, value }) {
  const sym = (symbol || '').trim().toUpperCase()
  if (!sym) throw new Error('symbol required')
  if (!TYPES.has(type)) throw new Error(`unknown alert type: ${type}`)
  if (type === 'volume') operator = '>' // ratio below threshold is meaningless
  if (operator !== '>' && operator !== '<') throw new Error('operator must be > or <')
  const v = Number(value)
  if (!Number.isFinite(v)) throw new Error('value must be a number')
  if (type === 'rsi' && (v < 0 || v > 100)) throw new Error('RSI must be 0-100')
  if (type === 'sma_cross' && (!Number.isInteger(v) || v < 2)) throw new Error('SMA window must be an integer ≥ 2')
  return { symbol: sym, type, operator, value: v }
}

export function addAlert({ symbol, type, operator, value, delivery }) {
  const cond = normalizeCondition({ symbol, type, operator, value })

  const alerts = loadAlerts()
  const id = Math.max(0, ...alerts.map((a) => a.id)) + 1
  const created = Date.now()
  const alert = {
    id,
    ...cond,
    created,
    triggered: null,
    current: null,
    deliveryId: newDeliveryId(created, id),
    delivery: normalizeDelivery(delivery || getAlertDeliveryPrefs()),
    deliveryStatus: null,
  }
  save([...alerts, alert])
  return alert
}

/**
 * Edit an alert's condition in place. Returns the updated alert, or null if the
 * id is gone. Delivery settings and deliveryId ride along untouched — the row's
 * delivery controls own those. Changing the condition re-arms a fired alert:
 * the old trigger was for a question the user just stopped asking. A no-op edit
 * leaves the fired state alone so re-saving the same values doesn't wipe it.
 */
export function updateAlert(id, patch = {}) {
  const alerts = loadAlerts()
  const alert = alerts.find((a) => a.id === id)
  if (!alert) return null

  const cond = normalizeCondition({
    symbol: patch.symbol ?? alert.symbol,
    type: patch.type ?? alert.type,
    operator: patch.operator ?? alert.operator,
    value: patch.value ?? alert.value,
  })
  const changed = ['symbol', 'type', 'operator', 'value'].some((k) => cond[k] !== alert[k])
  const next = { ...alert, ...cond }
  if (changed && alert.triggered) {
    next.triggered = null
    next.current = null
    next.deliveryId = newDeliveryId(Date.now(), id)
    next.deliveryStatus = null
  }
  save(alerts.map((a) => (a.id === id ? next : a)))
  return next
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

export function setAlertDelivery(id, patch) {
  const alerts = loadAlerts()
  const alert = alerts.find((item) => item.id === id)
  if (!alert || alert.triggered) return false
  const delivery = normalizeDelivery({ ...(alert.delivery || DEFAULT_DELIVERY), ...patch })
  save(alerts.map((item) => (
    item.id === id ? { ...item, delivery, deliveryStatus: null } : item
  )))
  return true
}

export function markDeliveryStatus(id, deliveryStatus) {
  save(loadAlerts().map((a) => (
    a.id === id ? { ...a, deliveryStatus } : a
  )))
}

export function rearmAlert(id) {
  save(loadAlerts().map((a) => (a.id === id ? {
    ...a,
    triggered: null,
    current: null,
    deliveryId: newDeliveryId(Date.now(), id),
    deliveryStatus: null,
  } : a)))
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

/** The condition without its symbol, for UIs that render the symbol as a link. */
export function conditionDetail(a) {
  if (a.type === 'rsi') return `RSI ${a.operator} ${a.value}`
  if (a.type === 'sma_cross') return `crosses ${a.operator === '>' ? 'above' : 'below'} SMA${a.value}`
  if (a.type === 'volume') return `volume > ${a.value}x avg`
  return `price ${a.operator} ${a.value}`
}

export function conditionText(a) {
  return `${a.symbol} ${conditionDetail(a)}`
}
