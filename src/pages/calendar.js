// Economic calendar: upcoming events color-coded by type.

import { loadEcon, loadMeta } from '../lib/data.js'
import { formatDate } from '../lib/format.js'

// Event type color mapping
const TYPE_COLORS = {
  fomc:    { bg: 'bg-red-500/15', text: 'text-red-400', label: 'FOMC' },
  fed:     { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Fed' },
  cpi:     { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'CPI' },
  nfp:     { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'NFP' },
  jobs:    { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Jobs' },
  gdp:     { bg: 'bg-cyan-500/15', text: 'text-cyan-400', label: 'GDP' },
  pce:     { bg: 'bg-purple-500/15', text: 'text-purple-400', label: 'PCE' },
  ism:     { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'ISM' },
  retail:  { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Retail' },
  housing: { bg: 'bg-teal-500/15', text: 'text-teal-400', label: 'Housing' },
}

export async function render(el) {
  const [econ, meta] = await Promise.all([loadEcon(), loadMeta()])

  if (!econ?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No economic calendar data available.'
    el.appendChild(msg)
    return
  }

  // Sort by date ascending
  const sorted = [...econ].sort((a, b) => {
    const da = new Date(a.date || 0)
    const db = new Date(b.date || 0)
    return da - db
  })

  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Economic Calendar'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Group events by date
  const grouped = new Map()
  for (const event of sorted) {
    const dateKey = event.date || 'Unknown'
    if (!grouped.has(dateKey)) grouped.set(dateKey, [])
    grouped.get(dateKey).push(event)
  }

  // Render date groups
  for (const [dateKey, events] of grouped) {
    const dateSection = document.createElement('div')

    // Date label
    const dateLabel = document.createElement('div')
    dateLabel.className = 'text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2'
    try {
      const d = new Date(dateKey)
      dateLabel.textContent = isNaN(d) ? dateKey : formatDate(d)
    } catch {
      dateLabel.textContent = dateKey
    }
    dateSection.appendChild(dateLabel)

    // Events grid
    const eventsGrid = document.createElement('div')
    eventsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2'

    for (const event of events) {
      const colors = getTypeColors(event.type, event.event)
      const card = document.createElement('div')
      card.className = `card p-3 border-l-2 ${colors.border}`

      // Type badge
      const typeBadge = document.createElement('span')
      typeBadge.className = `badge ${colors.bg} ${colors.text} mb-2`
      typeBadge.textContent = colors.label || event.type || 'Event'

      // Event name
      const nameEl = document.createElement('div')
      nameEl.className = 'text-sm text-zinc-200 font-medium'
      nameEl.textContent = event.event || event.name || '—'

      // Time
      const timeEl = document.createElement('div')
      timeEl.className = 'text-xs text-zinc-500 mt-1 font-mono'
      timeEl.textContent = event.time || ''

      card.append(typeBadge, nameEl)
      if (event.time) card.appendChild(timeEl)
      eventsGrid.appendChild(card)
    }

    dateSection.appendChild(eventsGrid)
    container.appendChild(dateSection)
  }

  el.textContent = ''
  el.appendChild(container)
}

/** Match event type/name to color scheme */
function getTypeColors(type, eventName) {
  const t = (type || '').toLowerCase()
  const n = (eventName || '').toLowerCase()

  // Check explicit type first
  if (TYPE_COLORS[t]) {
    return { ...TYPE_COLORS[t], border: TYPE_COLORS[t].text.replace('text-', 'border-') }
  }

  // Infer from event name
  for (const [key, colors] of Object.entries(TYPE_COLORS)) {
    if (n.includes(key)) {
      return { ...colors, border: colors.text.replace('text-', 'border-') }
    }
  }

  // Check for partial matches
  if (n.includes('rate') || n.includes('fed') || n.includes('fomc')) {
    return { ...TYPE_COLORS.fomc, border: 'border-red-400' }
  }
  if (n.includes('inflation') || n.includes('price')) {
    return { ...TYPE_COLORS.cpi, border: 'border-amber-400' }
  }
  if (n.includes('employ') || n.includes('payroll') || n.includes('labor')) {
    return { ...TYPE_COLORS.nfp, border: 'border-amber-400' }
  }

  // Default
  return { bg: 'bg-zinc-800', text: 'text-zinc-400', label: type || 'Event', border: 'border-zinc-600' }
}
