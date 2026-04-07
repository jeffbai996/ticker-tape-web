// Economic calendar: FOMC, CPI, NFP, GDP, PCE events with detail.

import { loadEcon } from '../lib/data.js'
import { formatDate } from '../lib/format.js'

const TYPE_COLORS = {
  FOMC: { border: 'border-l-red-500',    bg: 'bg-red-500/10',    text: 'text-red-400',    label: 'FOMC Decision' },
  CPI:  { border: 'border-l-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-400',  label: 'Consumer Price Index' },
  NFP:  { border: 'border-l-amber-500',  bg: 'bg-amber-500/10',  text: 'text-amber-400',  label: 'Non-Farm Payrolls' },
  GDP:  { border: 'border-l-cyan-500',   bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   label: 'Gross Domestic Product' },
  PCE:  { border: 'border-l-purple-500', bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Personal Consumption Expenditures' },
}

const TYPE_DESC = {
  FOMC: 'Federal Reserve interest rate decision and monetary policy statement. Markets react sharply to rate changes and forward guidance.',
  CPI:  'Measures change in consumer prices. Key inflation gauge watched by the Fed. Core CPI (ex food & energy) is the focus.',
  NFP:  'Bureau of Labor Statistics jobs report. Measures payroll employment change. Unemployment rate and wage growth also reported.',
  GDP:  'Quarterly measure of total economic output. Advance, preliminary, and final estimates released in sequence.',
  PCE:  'The Fed\'s preferred inflation measure. Includes both goods and services. Core PCE excludes food and energy.',
}

const TYPE_IMPACT = {
  FOMC: 'Very High',
  CPI:  'High',
  NFP:  'High',
  GDP:  'Medium',
  PCE:  'Medium-High',
}

export async function render(el) {
  const econ = await loadEcon()

  if (!econ?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No economic calendar data available.'
    el.appendChild(msg)
    return
  }

  const container = document.createElement('div')
  container.className = 'p-4 fade-in'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between mb-4'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Economic Calendar'
  const legend = document.createElement('div')
  legend.className = 'flex items-center gap-3 text-[10px]'
  for (const [type, cfg] of Object.entries(TYPE_COLORS)) {
    const item = document.createElement('span')
    item.className = `flex items-center gap-1 ${cfg.text}`
    item.textContent = type
    legend.appendChild(item)
  }
  header.append(h1, legend)
  container.appendChild(header)

  // Group by month
  const byMonth = {}
  for (const event of econ) {
    const d = new Date(event.date)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const monthLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!byMonth[monthKey]) byMonth[monthKey] = { label: monthLabel, events: [] }
    byMonth[monthKey].events.push(event)
  }

  for (const [key, group] of Object.entries(byMonth)) {
    const monthHeader = document.createElement('h2')
    monthHeader.className = 'text-sm font-semibold text-zinc-400 mt-4 mb-2'
    monthHeader.textContent = group.label
    container.appendChild(monthHeader)

    for (const event of group.events) {
      const type = event.type || 'FOMC'
      const cfg = TYPE_COLORS[type] || TYPE_COLORS.FOMC
      const desc = TYPE_DESC[type] || ''
      const impact = TYPE_IMPACT[type] || 'Medium'

      const d = new Date(event.date)
      const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'long' })
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

      const card = document.createElement('div')
      card.className = `card border-l-4 ${cfg.border} p-4 mb-2`

      // Top row: type badge + date + days until
      const topRow = document.createElement('div')
      topRow.className = 'flex items-center gap-3 mb-2'

      const badge = document.createElement('span')
      badge.className = `badge ${cfg.bg} ${cfg.text} font-semibold`
      badge.textContent = type

      const dateEl = document.createElement('span')
      dateEl.className = 'text-sm text-zinc-300'
      dateEl.textContent = `${dayOfWeek}, ${dateStr}`

      const daysEl = document.createElement('span')
      daysEl.className = 'ml-auto text-xs font-mono'
      if (event.days_until <= 2) {
        daysEl.className += ' text-red-400 font-semibold'
      } else if (event.days_until <= 7) {
        daysEl.className += ' text-amber-400'
      } else {
        daysEl.className += ' text-zinc-500'
      }
      daysEl.textContent = event.days_until === 0 ? 'TODAY' : event.days_until === 1 ? 'TOMORROW' : `${event.days_until}d`

      topRow.append(badge, dateEl, daysEl)

      // Detail row: full name + impact
      const detailRow = document.createElement('div')
      detailRow.className = 'flex items-center gap-3 mb-1'

      const fullName = document.createElement('span')
      fullName.className = 'text-xs text-zinc-400'
      fullName.textContent = cfg.label

      const impactEl = document.createElement('span')
      impactEl.className = 'text-[10px] text-zinc-600 ml-auto'
      impactEl.textContent = `Impact: ${impact}`

      detailRow.append(fullName, impactEl)

      // Description
      const descEl = document.createElement('p')
      descEl.className = 'text-xs text-zinc-500 leading-relaxed'
      descEl.textContent = desc

      card.append(topRow, detailRow, descEl)
      container.appendChild(card)
    }
  }

  el.textContent = ''
  el.appendChild(container)
}
