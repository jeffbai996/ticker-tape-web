import { loadAlerts, markDeliveryStatus } from './alerts.js'
import { wireUrl } from './wire.js'

const inFlight = new Set()

export async function fetchAlertDestinations() {
  const base = wireUrl().replace(/\/$/, '')
  if (!base) return []
  const response = await fetch(`${base}/api/alerts/destinations`)
  if (!response.ok) throw new Error(`wire ${response.status}`)
  const body = await response.json()
  return Array.isArray(body.destinations) ? body.destinations : []
}

/** Deliver one pending alert. Only server-accepted terminal states are saved. */
export async function deliverAlert(alert) {
  if (!alert?.delivery?.enabled || !alert.delivery.destination) return 'disabled'
  const base = wireUrl().replace(/\/$/, '')
  if (!base || !alert.deliveryId || inFlight.has(alert.deliveryId)) return 'pending'
  inFlight.add(alert.deliveryId)
  try {
    const response = await fetch(`${base}/api/alerts/deliver`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delivery_id: alert.deliveryId,
        destination: alert.delivery.destination,
        max_per_hour: alert.delivery.maxPerHour,
        symbol: alert.symbol,
        type: alert.type,
        operator: alert.operator,
        value: alert.value,
        current: alert.current,
        triggered_at: alert.triggered / 1000,
      }),
    })
    const body = await response.json().catch(() => ({}))
    if (response.ok && body.ok
        && (body.status === 'sent' || body.status === 'rate_limited')) {
      markDeliveryStatus(alert.id, body.status)
      return body.status
    }
    if (response.status === 400) {
      markDeliveryStatus(alert.id, 'invalid')
      return 'invalid'
    }
    return 'pending'
  } catch {
    return 'pending'
  } finally {
    inFlight.delete(alert.deliveryId)
  }
}

export function queueAlertDelivery(alert) {
  if (!alert?.delivery?.enabled || !alert.delivery.destination) {
    return Promise.resolve('disabled')
  }
  markDeliveryStatus(alert.id, 'pending')
  const pending = loadAlerts().find((item) => item.id === alert.id)
  return deliverAlert(pending)
}

/** Resume only retryable entries. Rate-limited/invalid rows are terminal. */
export function retryPendingAlertDeliveries() {
  const pending = loadAlerts().filter((alert) => (
    alert.triggered && alert.delivery?.enabled
    && alert.deliveryStatus === 'pending'
  ))
  return Promise.all(pending.map(deliverAlert))
}
