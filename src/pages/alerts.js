// Alerts page: manage recurring price alerts.
// Alerts live in localStorage via lib/alerts.js. Firing disarms an alert — it
// stays in the list with a "fired" badge until you re-arm or delete it.

import { loadAlerts, addAlert, removeAlert, setArmed, clearFired } from '../lib/alerts.js'
import { loadQuotes } from '../lib/data.js'
import { fmtPrice, fmtPct } from '../lib/format.js'
import { onLiveUpdate } from '../lib/live.js'

let rootEl = null
let unsubLive = null

export async function render(el) {
  rootEl = el
  el.textContent = ''

  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4 max-w-4xl'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Price Alerts'
  const hint = document.createElement('span')
  hint.className = 'text-xs text-zinc-500'
  hint.textContent = 'Alerts fire once, then disarm. Re-arm to fire again.'
  header.append(h1, hint)

  // Add-alert form
  const form = buildForm()

  // List placeholder (re-rendered on data changes)
  const listEl = document.createElement('div')
  listEl.id = 'alerts-list'

  container.append(header, form, listEl)
  el.appendChild(container)

  await refreshList(listEl)

  // Re-render on each live update so "Current" prices stay live.
  if (unsubLive) unsubLive()
  unsubLive = onLiveUpdate(() => refreshList(listEl))
}

function buildForm() {
  const form = document.createElement('div')
  form.className = 'card p-3 flex flex-wrap items-end gap-2'

  const symWrap = fieldWrap('Symbol', 'w-28')
  const symInput = document.createElement('input')
  symInput.type = 'text'
  symInput.placeholder = 'NVDA'
  symInput.className = inputClass() + ' uppercase font-mono'
  symWrap.appendChild(symInput)

  const opWrap = fieldWrap('Operator', 'w-20')
  const opSelect = document.createElement('select')
  opSelect.className = inputClass()
  for (const op of ['>', '<', '=']) {
    const o = document.createElement('option')
    o.value = op; o.textContent = op
    opSelect.appendChild(o)
  }
  opWrap.appendChild(opSelect)

  const valWrap = fieldWrap('Price', 'w-28')
  const valInput = document.createElement('input')
  valInput.type = 'number'
  valInput.step = '0.01'
  valInput.placeholder = '150.00'
  valInput.className = inputClass() + ' font-mono'
  valWrap.appendChild(valInput)

  const addBtn = document.createElement('button')
  addBtn.className = 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium rounded-md px-4 py-1.5 text-sm transition-colors'
  addBtn.textContent = 'Add Alert'

  const errorEl = document.createElement('div')
  errorEl.className = 'w-full text-xs text-red-400 hidden'

  const submit = () => {
    errorEl.classList.add('hidden')
    const sym = symInput.value.trim().toUpperCase()
    const op = opSelect.value
    const val = parseFloat(valInput.value)
    if (!/^[A-Z.]{1,10}$/.test(sym)) return showError(errorEl, 'Invalid symbol')
    if (!isFinite(val) || val <= 0) return showError(errorEl, 'Invalid price')
    addAlert(sym, op, val)
    symInput.value = ''
    valInput.value = ''
    symInput.focus()
    refreshList(document.getElementById('alerts-list'))
  }

  addBtn.addEventListener('click', submit)
  for (const input of [symInput, valInput]) {
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })
  }

  form.append(symWrap, opWrap, valWrap, addBtn, errorEl)
  return form
}

async function refreshList(listEl) {
  if (!listEl) return
  const [alerts, quotes] = await Promise.all([
    Promise.resolve(loadAlerts()),
    loadQuotes(),
  ])
  listEl.textContent = ''

  if (!alerts.length) {
    const empty = document.createElement('div')
    empty.className = 'card p-6 text-center text-zinc-500 text-sm'
    empty.textContent = 'No alerts yet. Add one above.'
    listEl.appendChild(empty)
    return
  }

  const table = document.createElement('div')
  table.className = 'card overflow-hidden'

  // Header row
  const thead = document.createElement('div')
  thead.className = 'grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto] gap-3 px-3 py-2 border-b border-zinc-800 text-[10px] font-semibold uppercase tracking-wider text-zinc-500'
  for (const h of ['Symbol', 'Condition', 'Current', 'Status', 'Last Fired', 'Actions']) {
    const c = document.createElement('div')
    c.textContent = h
    thead.appendChild(c)
  }
  table.appendChild(thead)

  for (const alert of alerts) {
    const quote = quotes?.find(q => q.symbol === alert.symbol)
    const currentPrice = quote?.price

    const row = document.createElement('div')
    row.className = 'grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr_auto] gap-3 px-3 py-2 border-b border-zinc-800 last:border-b-0 items-center text-sm'

    const sym = document.createElement('div')
    sym.className = 'font-mono font-semibold text-zinc-200'
    sym.textContent = alert.symbol

    const cond = document.createElement('div')
    cond.className = 'font-mono text-zinc-400'
    cond.textContent = `${alert.operator} ${fmtPrice(alert.value)}`

    const current = document.createElement('div')
    current.className = 'font-mono text-zinc-300'
    if (currentPrice != null) {
      const distPct = alert.value ? ((currentPrice - alert.value) / alert.value) * 100 : 0
      current.textContent = fmtPrice(currentPrice)
      const dist = document.createElement('span')
      dist.className = 'ml-1 text-xs text-zinc-500'
      dist.textContent = `(${fmtPct(distPct)})`
      current.appendChild(dist)
    } else {
      current.textContent = '—'
    }

    const status = document.createElement('div')
    status.appendChild(statusBadge(alert))

    const lastFired = document.createElement('div')
    lastFired.className = 'text-xs text-zinc-500 font-mono'
    lastFired.textContent = alert.last_fired
      ? `${new Date(alert.last_fired).toLocaleString()} (×${alert.fire_count || 1})`
      : '—'

    const actions = document.createElement('div')
    actions.className = 'flex gap-1'
    actions.appendChild(armButton(alert, listEl))
    actions.appendChild(deleteButton(alert, listEl))

    row.append(sym, cond, current, status, lastFired, actions)
    table.appendChild(row)
  }

  listEl.appendChild(table)
}

function statusBadge(alert) {
  const badge = document.createElement('span')
  badge.className = 'inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider'
  if (alert.armed) {
    badge.classList.add('bg-emerald-500/20', 'text-emerald-400')
    badge.textContent = 'Armed'
  } else {
    badge.classList.add('bg-amber-500/20', 'text-amber-400')
    badge.textContent = 'Fired'
  }
  return badge
}

function armButton(alert, listEl) {
  const btn = document.createElement('button')
  btn.className = 'px-2 py-1 text-xs rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors'
  if (alert.armed) {
    btn.textContent = 'Disarm'
    btn.title = 'Pause this alert'
    btn.addEventListener('click', () => { setArmed(alert.id, false); refreshList(listEl) })
  } else {
    btn.textContent = 'Re-arm'
    btn.title = 'Arm this alert again'
    btn.addEventListener('click', () => { clearFired(alert.id); refreshList(listEl) })
  }
  return btn
}

function deleteButton(alert, listEl) {
  const btn = document.createElement('button')
  btn.className = 'px-2 py-1 text-xs rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-400 transition-colors'
  btn.textContent = 'Delete'
  btn.title = 'Remove this alert'
  btn.addEventListener('click', () => { removeAlert(alert.id); refreshList(listEl) })
  return btn
}

function fieldWrap(label, widthClass) {
  const wrap = document.createElement('div')
  wrap.className = widthClass
  const lbl = document.createElement('label')
  lbl.className = 'block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1'
  lbl.textContent = label
  wrap.appendChild(lbl)
  return wrap
}

function inputClass() {
  return 'w-full bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500'
}

function showError(el, msg) {
  el.textContent = msg
  el.classList.remove('hidden')
}
