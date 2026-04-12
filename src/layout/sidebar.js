// Sidebar: navigation + watchlist + market pulse.
// innerHTML: renders data from our own JSON files, not user input.

import { loadQuotes, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtPct, changeColor, esc } from '../lib/format.js'
import { addToWatchlist } from '../lib/watchlist.js'
import { startPolling, onLiveUpdate, addSymbols, getStaleness } from '../lib/live.js'
import { evaluateAlerts } from '../lib/alerts.js'
import { notifyAlert } from '../lib/toast.js'
import { go } from '../router.js'

let watchlistEl = null
let pulseEl = null

// Lucide-style SVG icons (16x16, stroke-based, inherits currentColor)
const svg = (d) => `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`

const NAV_ICONS = {
  dashboard:   svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
  market:      svg('<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>'),
  sectors:     svg('<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>'),
  earnings:    svg('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
  heatmap:     svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-2-3.46-2-5.5a5.5 5.5 0 0 1 11 0c0 2.04-.93 3.36-2 5.5-.5 1-1 1.62-1 3a2.5 2.5 0 0 0 2.5 2.5"/><path d="M12 21v-7"/>'),
  commodities: svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
  calendar:    svg('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M10 16l2 2 4-4"/>'),
  news:        svg('<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/>'),
  journal:     svg('<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/>'),
  terminal:    svg('<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>'),
}

const SEARCH_SVG = svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>')

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard' },
  { id: 'market',      label: 'Market' },
  { id: 'sectors',     label: 'Sectors' },
  { id: 'earnings',    label: 'Earnings' },
  { id: 'heatmap',     label: 'Heatmap' },
  { id: 'commodities', label: 'Commodities' },
  { id: 'calendar',    label: 'Econ Calendar' },
  { id: 'news',        label: 'News' },
  { id: 'journal',     label: 'Journal' },
  { id: 'terminal',    label: 'Terminal' },
]

export function initSidebar(el) {
  const navSection = document.createElement('div')
  navSection.className = 'p-2 border-b border-zinc-800'

  for (const item of NAV_ITEMS) {
    const btn = document.createElement('button')
    btn.dataset.nav = item.id
    btn.className = 'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors'
    const iconSpan = document.createElement('span')
    iconSpan.className = 'w-4 text-center shrink-0 flex items-center justify-center'
    // SVG icons from our pre-defined set — safe static content
    /* eslint-disable no-unsanitized/property */
    iconSpan.innerHTML = NAV_ICONS[item.id] || ''
    /* eslint-enable no-unsanitized/property */
    const labelSpan = document.createElement('span')
    labelSpan.className = 'max-lg:hidden'
    labelSpan.textContent = item.label
    btn.append(iconSpan, labelSpan)
    btn.addEventListener('click', () => go(item.id))
    navSection.appendChild(btn)
  }

  // Cmd+K hint
  const cmdHint = document.createElement('button')
  cmdHint.className = 'w-full flex items-center gap-2 px-2.5 py-1.5 mt-1 rounded-md text-xs text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/50 transition-colors'
  const searchIcon = document.createElement('span')
  searchIcon.className = 'w-4 text-center shrink-0 flex items-center justify-center'
  /* eslint-disable no-unsanitized/property */
  searchIcon.innerHTML = SEARCH_SVG
  /* eslint-enable no-unsanitized/property */
  const searchLabel = document.createElement('span')
  searchLabel.className = 'max-lg:hidden'
  searchLabel.textContent = 'Search'
  const kbd = document.createElement('kbd')
  kbd.className = 'max-lg:hidden ml-auto text-[10px] bg-zinc-800 px-1 rounded'
  kbd.textContent = '⌘K'
  cmdHint.append(searchIcon, searchLabel, kbd)
  cmdHint.addEventListener('click', () => document.dispatchEvent(new Event('open-palette')))
  navSection.appendChild(cmdHint)

  // Watchlist section
  const watchSection = document.createElement('div')
  watchSection.className = 'flex-1 overflow-y-auto'

  // Watchlist header with + button
  const watchHeader = document.createElement('div')
  watchHeader.className = 'px-3 py-2 flex items-center justify-between max-lg:hidden'
  const watchLabel = document.createElement('span')
  watchLabel.className = 'text-[10px] font-semibold uppercase tracking-wider text-zinc-600'
  watchLabel.textContent = 'Watchlist'
  const addBtn = document.createElement('button')
  addBtn.className = 'text-zinc-600 hover:text-zinc-300 text-sm leading-none px-1 rounded hover:bg-zinc-800 transition-colors'
  addBtn.textContent = '+'
  addBtn.title = 'Add symbol'
  addBtn.addEventListener('click', () => showAddInput(watchHeader))
  watchHeader.append(watchLabel, addBtn)

  watchlistEl = document.createElement('div')
  watchlistEl.className = 'space-y-px px-1'
  watchSection.append(watchHeader, watchlistEl)

  // Pulse section
  pulseEl = document.createElement('div')
  pulseEl.className = 'p-2 border-t border-zinc-800 max-lg:hidden'

  el.append(navSection, watchSection, pulseEl)

  refreshWatchlist()
  setInterval(refreshWatchlist, 30_000)

  // Start live polling with watchlist symbols
  loadMeta().then(meta => {
    if (meta?.symbols?.length) startPolling(meta.symbols)
  })

  // Instant refresh when live data arrives
  onLiveUpdate(() => {
    refreshWatchlist()
    document.dispatchEvent(new Event('live-data-update'))
  })
}

function showAddInput(headerEl) {
  // Don't create multiple inputs
  if (headerEl.querySelector('input')) return

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'SYM'
  input.className = 'bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] text-zinc-200 w-16 font-mono uppercase focus:outline-none focus:border-zinc-500'

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const sym = input.value.trim()
      if (sym) {
        addToWatchlist(sym)
        addSymbols([sym.toUpperCase()])
        refreshWatchlist()
      }
      input.remove()
    } else if (e.key === 'Escape') {
      input.remove()
    }
  })

  input.addEventListener('blur', () => input.remove())

  headerEl.appendChild(input)
  input.focus()
}

async function refreshWatchlist() {
  const [quotes, meta] = await Promise.all([loadQuotes(), loadMeta()])
  if (!quotes) return

  watchlistEl.textContent = ''
  for (const q of quotes) {
    const row = document.createElement('button')
    row.className = 'w-full flex items-center gap-1 px-2 py-1 rounded hover:bg-zinc-800/50 transition-colors cursor-pointer'
    row.addEventListener('click', () => go('lookup', q.symbol))

    const colorClass = changeColor(q.pct)

    // Symbol — always visible
    const symSpan = document.createElement('span')
    symSpan.className = 'font-mono text-xs font-bold text-zinc-300 w-10 shrink-0'
    symSpan.textContent = q.symbol

    // Compact pct for collapsed sidebar (max-lg only)
    const compactPct = document.createElement('span')
    compactPct.className = `font-mono text-[9px] font-semibold ${colorClass} lg:hidden`
    compactPct.textContent = fmtPct(q.pct)

    // Price — hidden on collapsed sidebar
    const priceSpan = document.createElement('span')
    priceSpan.className = 'font-mono text-xs text-zinc-300 ml-auto max-lg:hidden'
    priceSpan.textContent = fmtPrice(q.price)

    // Pct — hidden on collapsed sidebar
    const pctSpan = document.createElement('span')
    pctSpan.className = `font-mono text-[10px] font-semibold ${colorClass} w-14 text-right max-lg:hidden`
    pctSpan.textContent = fmtPct(q.pct)

    row.append(symSpan, compactPct, priceSpan, pctSpan)
    watchlistEl.appendChild(row)
  }

  buildPulse(quotes)

  // Evaluate price alerts on each refresh
  const triggered = evaluateAlerts(quotes)
  for (const alert of triggered) {
    const quote = quotes.find(q => q.symbol === alert.symbol)
    notifyAlert(alert, quote?.price ?? 0)
  }
}

function buildPulse(quotes) {
  if (!pulseEl || !quotes?.length) return
  const pcts = quotes.map(q => q.pct).filter(p => p != null)
  if (!pcts.length) return

  const adv = pcts.filter(p => p > 0).length
  const dec = pcts.filter(p => p < 0).length
  const sorted = [...pcts].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const spread = sorted[sorted.length - 1] - sorted[0]
  const stress = pcts.filter(p => p < -3).length
  const greenPct = ((adv / pcts.length) * 100).toFixed(0)
  const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length
  const dispersion = Math.sqrt(pcts.reduce((s, p) => s + (p - mean) ** 2, 0) / pcts.length)
  const conviction = pcts.filter(p => Math.abs(p) > 2.0).length
  const flatness = pcts.filter(p => Math.abs(p) < 1.0).length

  // Extended hours movers
  const extPcts = quotes.map(q => q.ext_pct).filter(p => p != null && p !== 0)
  const extUp = extPcts.filter(p => p > 0).length
  const extDn = extPcts.filter(p => p < 0).length

  const staleness = getStaleness()
  const dotColor = staleness === 'live' ? 'bg-green-500' : staleness === 'delayed' ? 'bg-amber-400' : 'bg-zinc-600'
  const dotTitle = staleness === 'live' ? 'Live' : staleness === 'delayed' ? 'Delayed' : staleness === 'none' ? 'No live feed' : 'Stale'

  let html = `<div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1 flex items-center gap-1.5">Pulse<span class="w-1.5 h-1.5 rounded-full ${dotColor}" title="${dotTitle}"></span></div>`
    + `<div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">`
    + `<span class="text-zinc-500">Adv / Dec</span>`
    + `<span class="text-right font-mono"><span class="text-positive">${adv}</span> / <span class="text-negative">${dec}</span></span>`
    + `<span class="text-zinc-500">Median</span>`
    + `<span class="text-right font-mono ${changeColor(median)}">${fmtPct(median)}</span>`
    + `<span class="text-zinc-500">Spread</span>`
    + `<span class="text-right font-mono text-zinc-300">${spread.toFixed(2)}pp</span>`
    + `<span class="text-zinc-500">${stress > 0 ? '⚠ ' : ''}Stress</span>`
    + `<span class="text-right font-mono ${stress > 0 ? 'text-negative' : 'text-zinc-400'}">${stress}</span>`
    + `<span class="text-zinc-500">Ext Hrs</span>`
    + `<span class="text-right font-mono">${extPcts.length ? `<span class="text-positive">${extUp}</span> / <span class="text-negative">${extDn}</span>` : '<span class="text-zinc-600">—</span>'}</span>`
    + `<span class="text-zinc-500">Green %</span>`
    + `<span class="text-right font-mono ${Number(greenPct) >= 50 ? 'text-positive' : 'text-negative'}">${greenPct}%</span>`
    + `<span class="text-zinc-500">Dispersion</span>`
    + `<span class="text-right font-mono text-zinc-300">${dispersion.toFixed(2)}</span>`
    + `<span class="text-zinc-500">Conviction</span>`
    + `<span class="text-right font-mono text-zinc-300">${conviction}/${pcts.length}</span>`

  if (flatness > 0) {
    html += `<span class="text-zinc-500">Flatness</span>`
      + `<span class="text-right font-mono text-zinc-400">${flatness}</span>`
  }

  html += `</div>`
  pulseEl.innerHTML = html
}
