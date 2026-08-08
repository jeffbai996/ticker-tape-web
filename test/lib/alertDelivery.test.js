import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addAlert, getAlertDeliveryPrefs, loadAlerts, markTriggered,
  setAlertDelivery, setAlertDeliveryPrefs,
} from '../../src/lib/alerts.js'
import {
  deliverAlert, fetchAlertDestinations, queueAlertDelivery,
  retryPendingAlertDeliveries,
} from '../../src/lib/alertDelivery.js'
import { setWireUrl } from '../../src/lib/wire.js'

describe('alert delivery preferences and outbox', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  function triggeredAlert(delivery = {
    enabled: true, destination: 'desk', maxPerHour: 6,
  }) {
    const alert = addAlert({
      symbol: 'AAPL', type: 'price', operator: '>', value: 200, delivery,
    })
    markTriggered(alert.id, 201.5)
    return loadAlerts()[0]
  }

  it('is opt-in and lets saved defaults flow to every alert creator', () => {
    expect(getAlertDeliveryPrefs()).toEqual({
      enabled: false, destination: '', maxPerHour: 6,
    })
    setAlertDeliveryPrefs({ enabled: true, destination: 'macro', maxPerHour: 3 })
    const alert = addAlert({
      symbol: 'MSFT', type: 'rsi', operator: '<', value: 30,
    })
    expect(alert.delivery).toEqual({
      enabled: true, destination: 'macro', maxPerHour: 3,
    })
  })

  it('allows a per-alert override and rotates delivery id on re-arm', () => {
    const alert = addAlert({
      symbol: 'AAPL', type: 'price', operator: '>', value: 200,
    })
    setAlertDelivery(alert.id, {
      enabled: true, destination: 'desk', maxPerHour: 2,
    })
    expect(loadAlerts()[0].delivery).toMatchObject({
      enabled: true, destination: 'desk', maxPerHour: 2,
    })
    expect(loadAlerts()[0].deliveryId).toBe(alert.deliveryId)
  })

  it('fetches safe channel choices from fragwire', async () => {
    setWireUrl('https://wire.test')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true,
        destinations: [{ key: 'desk', label: 'Trading desk' }],
      }),
    }))
    await expect(fetchAlertDestinations()).resolves.toEqual([
      { key: 'desk', label: 'Trading desk' },
    ])
  })

  it('posts the selected destination and marks a successful send', async () => {
    setWireUrl('https://wire.test')
    const alert = triggeredAlert()
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, status: 'sent', duplicate: false }),
    })
    vi.stubGlobal('fetch', fetch)

    expect(await queueAlertDelivery(alert)).toBe('sent')

    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toMatchObject({
      delivery_id: alert.deliveryId, destination: 'desk', max_per_hour: 6,
      symbol: 'AAPL', type: 'price', current: 201.5,
    })
    expect(loadAlerts()[0].deliveryStatus).toBe('sent')
  })

  it('marks rate-limited alerts terminal so they never burst later', async () => {
    setWireUrl('https://wire.test')
    const alert = triggeredAlert()
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        ok: true, status: 'rate_limited', duplicate: false,
      }),
    })
    vi.stubGlobal('fetch', fetch)

    expect(await queueAlertDelivery(alert)).toBe('rate_limited')
    expect(loadAlerts()[0].deliveryStatus).toBe('rate_limited')
    await retryPendingAlertDeliveries()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('leaves failures pending and retries only pending opted-in alerts', async () => {
    setWireUrl('https://wire.test')
    const alert = triggeredAlert()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    expect(await queueAlertDelivery(alert)).toBe('pending')
    expect(loadAlerts()[0].deliveryStatus).toBe('pending')

    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, status: 'sent', duplicate: false }),
    })
    vi.stubGlobal('fetch', fetch)
    await retryPendingAlertDeliveries()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(loadAlerts()[0].deliveryStatus).toBe('sent')
  })

  it('does not request delivery when disabled or disconnected', async () => {
    const disabled = triggeredAlert({
      enabled: false, destination: 'desk', maxPerHour: 6,
    })
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await queueAlertDelivery(disabled)).toBe('disabled')
    expect(fetch).not.toHaveBeenCalled()
    expect(await deliverAlert(disabled)).toBe('disabled')
  })
})
