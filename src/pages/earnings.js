// Earnings calendar: upcoming earnings sorted by days until.

import { loadEarnings, loadMeta } from '../lib/data.js'
import { fmtPrice, esc } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el) {
  const [earnings, meta] = await Promise.all([loadEarnings(), loadMeta()])

  if (!earnings?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No earnings data available.'
    el.appendChild(msg)
    return
  }

  // Sort by days_until ascending (soonest first)
  const sorted = [...earnings].sort((a, b) => (a.days_until ?? 999) - (b.days_until ?? 999))

  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Earnings Calendar'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Table card
  const card = document.createElement('div')
  card.className = 'card overflow-hidden'

  const table = document.createElement('table')
  table.className = 'w-full text-sm'

  // Table header
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  headRow.className = 'border-b border-zinc-800'
  for (const col of ['Symbol', 'Date', 'Days Until', 'EPS Est']) {
    const th = document.createElement('th')
    th.className = 'px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500'
    th.textContent = col
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)

  // Table body
  const tbody = document.createElement('tbody')

  for (const e of sorted) {
    const tr = document.createElement('tr')
    tr.className = 'border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors'

    // Urgency color for the row
    const isUrgent = e.days_until != null && e.days_until <= 2
    const isSoon = e.days_until != null && e.days_until <= 7

    // Symbol (clickable)
    const tdSym = document.createElement('td')
    tdSym.className = 'px-4 py-2'
    const symLink = document.createElement('span')
    symLink.className = 'font-mono text-amber-400 cursor-pointer hover:underline'
    symLink.textContent = e.symbol
    symLink.addEventListener('click', () => go('lookup', e.symbol))
    tdSym.appendChild(symLink)

    // Date
    const tdDate = document.createElement('td')
    tdDate.className = 'px-4 py-2 font-mono text-zinc-300'
    tdDate.textContent = e.date || '—'

    // Days Until
    const tdDays = document.createElement('td')
    tdDays.className = 'px-4 py-2 font-mono'
    if (e.days_until != null) {
      const badge = document.createElement('span')
      badge.className = `px-2 py-0.5 rounded text-xs font-medium ${
        isUrgent ? 'bg-red-500/20 text-red-400' :
        isSoon ? 'bg-amber-500/20 text-amber-400' :
        'text-zinc-300'
      }`
      badge.textContent = `${e.days_until}d`
      tdDays.appendChild(badge)
    } else {
      tdDays.textContent = '—'
    }

    // EPS Estimate
    const tdEps = document.createElement('td')
    tdEps.className = 'px-4 py-2 font-mono text-zinc-300'
    tdEps.textContent = e.eps_est != null ? `$${fmtPrice(e.eps_est)}` : '—'

    tr.append(tdSym, tdDate, tdDays, tdEps)
    tbody.appendChild(tr)
  }

  table.append(thead, tbody)
  card.appendChild(table)
  container.appendChild(card)
  el.textContent = ''
  el.appendChild(container)
}
