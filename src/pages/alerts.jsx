import { useEffect, useState } from 'preact/hooks'
import {
  loadAlerts, addAlert, removeAlert, rearmAlert, onAlertsChange, conditionText,
} from '../lib/alerts.js'
import { useQuotes } from '../hooks.js'
import { fmtPrice } from '../lib/format.js'

const TYPE_META = {
  price: { label: 'Price', hint: 'trigger level in $' },
  rsi: { label: 'RSI', hint: 'RSI(14) level, 0-100' },
  sma_cross: { label: 'SMA cross', hint: 'SMA window, e.g. 50 or 200' },
  volume: { label: 'Volume', hint: 'multiple of 20-day avg volume' },
}

function AddForm() {
  const [symbol, setSymbol] = useState('')
  const [type, setType] = useState('price')
  const [operator, setOperator] = useState('>')
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)

  const submit = (e) => {
    e.preventDefault()
    setError(null)
    try {
      addAlert({ symbol, type, operator, value: Number(value) })
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

  const field = 'bg-surface-2 border border-line rounded-md px-2 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-accent'

  return (
    <form onSubmit={submit} class="bg-surface-1 border border-line rounded-xl p-3 flex flex-wrap items-end gap-2">
      <label class="flex flex-col gap-1">
        <span class="text-[9px] text-muted uppercase tracking-wider">Symbol</span>
        <input class={`${field} w-24 uppercase`} value={symbol}
          onInput={(e) => setSymbol(e.currentTarget.value)} placeholder="MSFT" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-[9px] text-muted uppercase tracking-wider">Type</span>
        <select class={field} value={type} onChange={(e) => setType(e.currentTarget.value)}>
          {Object.entries(TYPE_META).map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
        </select>
      </label>
      {type !== 'volume' && (
        <label class="flex flex-col gap-1">
          <span class="text-[9px] text-muted uppercase tracking-wider">Op</span>
          <select class={field} value={operator} onChange={(e) => setOperator(e.currentTarget.value)}>
            <option value=">">{type === 'sma_cross' ? 'above' : '>'}</option>
            <option value="<">{type === 'sma_cross' ? 'below' : '<'}</option>
          </select>
        </label>
      )}
      <label class="flex flex-col gap-1">
        <span class="text-[9px] text-muted uppercase tracking-wider">{TYPE_META[type].hint}</span>
        <input class={`${field} w-28`} value={value} inputMode="decimal"
          onInput={(e) => setValue(e.currentTarget.value)} placeholder="0" />
      </label>
      <button type="submit"
        class="font-mono text-[11px] px-3 py-[7px] rounded-md border border-accent text-accent bg-accent-soft hover:bg-accent hover:text-black">
        + Add alert
      </button>
      {error && <span class="font-mono text-[11px] text-down pb-1.5">{error}</span>}
    </form>
  )
}

export function Alerts() {
  const [alerts, setAlerts] = useState(loadAlerts)
  useEffect(() => onAlertsChange(() => setAlerts(loadAlerts())), [])

  const symbols = [...new Set(alerts.map((a) => a.symbol))]
  const live = useQuotes(symbols)

  return (
    <div class="flex-1 p-3 select-text min-w-0">
      <div class="flex items-baseline gap-3 px-1 pb-2">
        <h1 class="font-mono font-bold text-lg text-ink">Alerts</h1>
        <span class="text-[11px] text-muted">
          checked against the live feed · triggered alerts stay put until re-armed
        </span>
      </div>

      <div class="flex flex-col gap-3 max-w-4xl">
        <AddForm />

        {alerts.length === 0 ? (
          <div class="px-1 font-mono text-[11px] text-muted">no alerts configured</div>
        ) : (
          <section class="bg-surface-1 border border-line rounded-xl overflow-x-auto">
            <table class="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr class="bg-surface-2 text-[9px] text-muted uppercase tracking-wider">
                  <th class="px-3 py-2 text-left">Condition</th>
                  <th class="px-2 py-2 text-right">Last</th>
                  <th class="px-2 py-2 text-left">Status</th>
                  <th class="px-2 py-2 text-left">Created</th>
                  <th class="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => {
                  const q = live[a.symbol]?.quote
                  return (
                    <tr key={a.id} class="border-t border-line hover:bg-surface-2">
                      <td class="px-3 py-[5px] text-ink whitespace-nowrap">
                        <a href={`#/research/${a.symbol.toLowerCase()}`} class="text-accent hover:underline">{a.symbol}</a>
                        {' '}{conditionText(a).slice(a.symbol.length + 1)}
                      </td>
                      <td class="px-2 py-[5px] text-right text-ink-2">{fmtPrice(q?.price)}</td>
                      <td class="px-2 py-[5px] whitespace-nowrap">
                        {a.triggered ? (
                          <span class="text-up">
                            TRIGGERED {new Date(a.triggered).toISOString().slice(5, 16).replace('T', ' ')}
                            {a.current != null && ` @ ${Number(a.current).toFixed(2)}`}
                          </span>
                        ) : (
                          <span class="text-accent">ARMED</span>
                        )}
                      </td>
                      <td class="px-2 py-[5px] text-muted whitespace-nowrap">
                        {new Date(a.created).toISOString().slice(0, 10)}
                      </td>
                      <td class="px-3 py-[5px] text-right whitespace-nowrap">
                        {a.triggered && (
                          <button onClick={() => rearmAlert(a.id)}
                            class="text-accent hover:underline mr-3">re-arm</button>
                        )}
                        <button onClick={() => removeAlert(a.id)}
                          class="text-down hover:underline">delete</button>
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
