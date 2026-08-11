import { useEffect, useState } from 'preact/hooks'
import {
  loadAlerts, addAlert, removeAlert, rearmAlert, onAlertsChange, conditionText,
  getAlertDeliveryPrefs, setAlertDeliveryPrefs, setAlertDelivery,
} from '../lib/alerts.js'
import {
  deliverAlert, fetchAlertDestinations,
} from '../lib/alertDelivery.js'
import { useQuotes } from '../hooks.js'
import { fmtPrice } from '../lib/format.js'
import { tl, t as tt } from '../lib/i18n.js'

const TYPE_META = {
  price: { label: 'Price', hint: 'alerts.hint.price' },
  rsi: { label: 'RSI', hint: 'alerts.hint.rsi' },
  sma_cross: { label: 'SMA cross', hint: 'alerts.hint.sma' },
  volume: { label: 'Volume', hint: 'alerts.hint.volume' },
}

const FIELD = 'bg-surface-2 border border-line rounded-md px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent disabled:opacity-40'

/** Read-and-clear a ride-along from the research header's ⏰ (mirrors the
 *  command bar's chat_prefill). One-shot: a reload starts empty. */
function consumeAlertPrefill() {
  try {
    const raw = sessionStorage.getItem('alert_prefill')
    if (!raw) return {}
    sessionStorage.removeItem('alert_prefill')
    return JSON.parse(raw) || {}
  } catch { return {} }
}

function AddForm({ destinations, prefs }) {
  const [prefill] = useState(consumeAlertPrefill)
  const [symbol, setSymbol] = useState(() => String(prefill.symbol || '').toUpperCase())
  const [type, setType] = useState('price')
  const [operator, setOperator] = useState('>')
  const [value, setValue] = useState(() => (prefill.value != null ? String(prefill.value) : ''))
  const [error, setError] = useState(null)
  const [delivery, setDelivery] = useState(prefs)

  useEffect(() => setDelivery(prefs), [prefs.enabled, prefs.destination, prefs.maxPerHour])

  const submit = (e) => {
    e.preventDefault()
    setError(null)
    try {
      addAlert({ symbol, type, operator, value: Number(value), delivery })
      setSymbol('')
      setValue('')
      // ask once, on the first alert the user creates — not on page load
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission()
      }
    } catch (err) {
      setError(String(err.message || err))
    }
  }

  return (
    <form onSubmit={submit} class="bg-surface-1 border border-line rounded-xl p-3 flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1">
        <span class="text-[9px] text-muted uppercase tracking-wider">{tl('Symbol')}</span>
        <input class={`${FIELD} w-24 uppercase`} value={symbol}
          onInput={(e) => setSymbol(e.currentTarget.value)} placeholder="MSFT" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[9px] text-muted uppercase tracking-wider">{tl('Type')}</span>
        <select class={FIELD} value={type} onChange={(e) => setType(e.currentTarget.value)}>
          {Object.entries(TYPE_META).map(([id, m]) => <option key={id} value={id}>{tl(m.label)}</option>)}
        </select>
      </label>
      {type !== 'volume' && (
        <label class="flex flex-col gap-1">
          <span class="text-[9px] text-muted uppercase tracking-wider">{tl('Op')}</span>
          <select class={FIELD} value={operator} onChange={(e) => setOperator(e.currentTarget.value)}>
            <option value=">">{type === 'sma_cross' ? 'above' : '>'}</option>
            <option value="<">{type === 'sma_cross' ? 'below' : '<'}</option>
          </select>
        </label>
      )}
      <label class="flex flex-col gap-1">
        <span class="text-[9px] text-muted uppercase tracking-wider">{tt(TYPE_META[type].hint)}</span>
        <input class={`${FIELD} w-28`} value={value} inputMode="decimal"
          onInput={(e) => setValue(e.currentTarget.value)} placeholder="0" />
      </label>
      <label class="flex items-center gap-2 px-2 py-1.5 h-[33px] border border-line rounded-md bg-surface-2">
        <input type="checkbox" checked={delivery.enabled}
          disabled={!destinations.length}
          onChange={(e) => setDelivery({
            ...delivery,
            enabled: e.currentTarget.checked,
            destination: delivery.destination || destinations[0]?.key || '',
          })} />
        <span class="text-[10px] text-ink-2 whitespace-nowrap">{tt('alerts.delivery.notify')}</span>
      </label>
      {delivery.enabled && destinations.length > 0 && (
        <>
          <label class="flex flex-col gap-1">
            <span class="text-[9px] text-muted uppercase tracking-wider">{tt('alerts.delivery.channel')}</span>
            <select class={FIELD} value={delivery.destination}
              onChange={(e) => setDelivery({ ...delivery, destination: e.currentTarget.value })}>
              {destinations.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-[9px] text-muted uppercase tracking-wider">{tt('alerts.delivery.max')}</span>
            <input class={`${FIELD} w-20`} type="number" min="1" max="60"
              value={delivery.maxPerHour}
              onInput={(e) => setDelivery({
                ...delivery, maxPerHour: Number(e.currentTarget.value),
              })} />
          </label>
        </>
      )}
      <button type="submit"
        class="font-mono text-[11px] px-3 py-[7px] rounded-md border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-black">
        {tl('+ Add alert')}
      </button>
      {error && <span class="font-mono text-[11px] text-down pb-1.5">{error}</span>}
    </form>
  )
}

function DeliveryDefaults({ destinations, prefs, setPrefs }) {
  const update = (patch) => setPrefs(setAlertDeliveryPrefs({ ...prefs, ...patch }))
  const available = destinations.length > 0
  return (
    <section class="bg-surface-1 border border-line rounded-xl p-3">
      <div class="flex flex-wrap gap-x-4 gap-y-2 items-center">
        <div class="min-w-52 flex-1">
          <div class="font-mono text-[11px] font-bold text-ink">{tt('alerts.delivery.title')}</div>
          <div class="text-[10px] text-muted mt-0.5 max-w-2xl">{tt('alerts.delivery.explain')}</div>
        </div>
        <span class="text-[9px] uppercase tracking-wider text-muted">
          {tt('alerts.delivery.default')}
        </span>
        <label class="flex items-center gap-2 text-[10px] text-ink-2">
          <input type="checkbox" checked={prefs.enabled} disabled={!available}
            onChange={(e) => update({
              enabled: e.currentTarget.checked,
              destination: prefs.destination || destinations[0]?.key || '',
            })} />
          {tt('alerts.delivery.notify')}
        </label>
        <select aria-label={tt('alerts.delivery.channel')} class={`${FIELD} min-w-32`}
          disabled={!available || !prefs.enabled}
          value={prefs.destination || destinations[0]?.key || ''}
          onChange={(e) => update({ destination: e.currentTarget.value })}>
          {destinations.map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
        </select>
        <label class="flex items-center gap-2 text-[9px] uppercase tracking-wider text-muted">
          {tt('alerts.delivery.max')}
          <input aria-label={tt('alerts.delivery.max')} class={`${FIELD} w-16`} type="number"
            min="1" max="60" disabled={!prefs.enabled}
            value={prefs.maxPerHour}
            onInput={(e) => update({ maxPerHour: Number(e.currentTarget.value) })} />
        </label>
      </div>
      {!available && (
        <div class="font-mono text-[10px] text-accent mt-2">{tt('alerts.delivery.none')}</div>
      )}
    </section>
  )
}

function DeliveryCell({ alert, destinations }) {
  const delivery = alert.delivery || { enabled: false, destination: '', maxPerHour: 6 }
  if (alert.triggered) {
    if (!delivery.enabled) return <span class="text-muted">{tt('alerts.delivery.browser')}</span>
    const status = alert.deliveryStatus || 'pending'
    return (
      <span class={status === 'sent' ? 'text-up' : status === 'rate_limited' ? 'text-muted' : 'text-accent'}>
        {tt(`alerts.delivery.${status}`)}
        {status === 'pending' && (
          <button class="ml-2 hover:underline" onClick={() => void deliverAlert(alert)}>{tl('retry')}</button>
        )}
      </span>
    )
  }
  return (
    <div class="flex items-center gap-1.5 min-w-[230px]">
      <input aria-label={tt('alerts.delivery.notify')} type="checkbox"
        checked={delivery.enabled} disabled={!destinations.length}
        onChange={(e) => setAlertDelivery(alert.id, {
          enabled: e.currentTarget.checked,
          destination: delivery.destination || destinations[0]?.key || '',
        })} />
      {delivery.enabled ? (
        <>
          <select aria-label={tt('alerts.delivery.channel')}
            class={`${FIELD} py-1 text-[10px] min-w-24`} value={delivery.destination}
            onChange={(e) => setAlertDelivery(alert.id, { destination: e.currentTarget.value })}>
            {destinations.map((item) => (
              <option key={item.key} value={item.key}>{item.label}</option>
            ))}
          </select>
          <input aria-label={tt('alerts.delivery.max')} class={`${FIELD} py-1 text-[10px] w-12`}
            type="number" min="1" max="60" value={delivery.maxPerHour}
            onInput={(e) => setAlertDelivery(alert.id, {
              maxPerHour: Number(e.currentTarget.value),
            })} />
          <span class="text-[9px] text-muted">/h</span>
        </>
      ) : <span class="text-muted">{tt('alerts.delivery.browser')}</span>}
    </div>
  )
}

export function Alerts() {
  const [alerts, setAlerts] = useState(loadAlerts)
  const [destinations, setDestinations] = useState([])
  const [prefs, setPrefs] = useState(getAlertDeliveryPrefs)
  useEffect(() => onAlertsChange(() => setAlerts(loadAlerts())), [])
  useEffect(() => {
    let live = true
    fetchAlertDestinations().then((items) => {
      if (live) setDestinations(items)
    }).catch(() => {
      if (live) setDestinations([])
    })
    return () => { live = false }
  }, [])

  const symbols = [...new Set(alerts.map((a) => a.symbol))]
  const live = useQuotes(symbols)

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <div class="flex items-baseline gap-3 px-1 pb-2">
        <h1 class="font-mono font-bold text-lg text-ink">{tl('Alerts')}</h1>
        <span class="text-[11px] text-muted">
          {tt('alerts.subtitle')}
        </span>
      </div>

      <div class="flex flex-col gap-3 max-w-6xl">
        <DeliveryDefaults destinations={destinations} prefs={prefs} setPrefs={setPrefs} />
        <AddForm destinations={destinations} prefs={prefs} />

        {alerts.length === 0 ? (
          <div class="px-1 font-mono text-[11px] text-muted">{tt('alerts.none')}</div>
        ) : (
          <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
            <table class="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                  <th class="px-3 py-2 text-left">{tl('Condition')}</th>
                  <th class="px-2 py-2 text-right">{tl('Last')}</th>
                  <th class="px-2 py-2 text-left">{tl('Status')}</th>
                  <th class="px-2 py-2 text-left">{tt('alerts.delivery.title')}</th>
                  <th class="px-2 py-2 text-left">{tl('Created')}</th>
                  <th class="px-3 py-2 text-right">{tl('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const q = live[a.symbol]?.quote
                  return (
                    <tr key={a.id} class="border-t border-line hover:bg-surface-3">
                      <td class="px-3 py-[3px] text-ink whitespace-nowrap">
                        <a href={`#/research/${a.symbol.toLowerCase()}`} class="text-accent hover:underline">{a.symbol}</a>
                        {' '}{conditionText(a).slice(a.symbol.length + 1)}
                      </td>
                      <td class="px-2 py-[3px] text-right text-ink-2">{fmtPrice(q?.price)}</td>
                      <td class="px-2 py-[3px] whitespace-nowrap">
                        {a.triggered ? (
                          <span class="text-up">
                            {tl('TRIGGERED')} {new Date(a.triggered).toISOString().slice(5, 16).replace('T', ' ')}
                            {a.current != null && ` @ ${Number(a.current).toFixed(2)}`}
                          </span>
                        ) : (
                          <span class="text-accent">{tl('ARMED')}</span>
                        )}
                      </td>
                      <td class="px-2 py-[3px] whitespace-nowrap">
                        <DeliveryCell alert={a} destinations={destinations} />
                      </td>
                      <td class="px-2 py-[3px] text-muted whitespace-nowrap">
                        {new Date(a.created).toISOString().slice(0, 10)}
                      </td>
                      <td class="px-3 py-[3px] text-right whitespace-nowrap">
                        {a.triggered && (
                          <button onClick={() => rearmAlert(a.id)}
                            class="text-accent hover:underline mr-3">{tl('re-arm')}</button>
                        )}
                        <button onClick={() => removeAlert(a.id)}
                          class="text-down hover:underline">{tl('delete')}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>
        )}
      </div>
    </div>
  )
}
