// Sidebar: navigation + watchlist + market pulse.
// innerHTML: renders data from our own JSON files, not user input.

import { loadQuotes, loadSparklines, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtPct, changeColor, sparklineSVG, esc } from '../lib/format.js'
import { go } from '../router.js'

let watchlistEl = null
let pulseEl = null

const NAV_ITEMS = [
  { id: 'dashboard',   label: 'Dashboard',      icon: '▦' },
  { id: 'market',      label: 'Market',          icon: '↗' },
  { id: 'sectors',     label: 'Sectors',         icon: '▤' },
  { id: 'earnings',    label: 'Earnings',        icon: '📅' },
  { id: 'heatmap',     label: 'Heatmap',         icon: '🔥' },
  { id: 'commodities', label: 'Commodities',     icon: '🛢' },
  { id: 'calendar',    label: 'Econ Calendar',   icon: '📋' },
  { id: 'news',        label: 'News',            icon: '📰' },
  { id: 'terminal',    label: 'Terminal',        icon: '>' },
]

export function initSidebar(el) {
  const navSection = document.createElement('div')
  navSection.className = 'p-2 border-b border-zinc-800'

  for (const item of NAV_ITEMS) {
    const btn = document.createElement('button')
    btn.dataset.nav = item.id
    btn.className = 'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors'
    const iconSpan = document.createElement('span')
    iconSpan.className = 'w-4 text-center shrink-0 text-xs'
    iconSpan.textContent = item.icon
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
  searchIcon.className = 'w-4 text-center shrink-0'
  searchIcon.textContent = '🔍'
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
  const watchHeader = document.createElement('div')
  watchHeader.className = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 max-lg:hidden'
  watchHeader.textContent = 'Watchlist'
  watchlistEl = document.createElement('div')
  watchlistEl.className = 'space-y-px px-1'
  watchSection.append(watchHeader, watchlistEl)

  // Pulse section
  pulseEl = document.createElement('div')
  pulseEl.className = 'p-2 border-t border-zinc-800 max-lg:hidden'

  el.append(navSection, watchSection, pulseEl)

  refreshWatchlist()
  setInterval(refreshWatchlist, 30_000)
}

async function refreshWatchlist() {
  const [quotes, sparklines, meta] = await Promise.all([
    loadQuotes(), loadSparklines(), loadMeta()
  ])
  if (!quotes) return

  watchlistEl.textContent = ''
  for (const q of quotes) {
    const row = document.createElement('button')
    row.className = 'w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-800/50 transition-colors cursor-pointer'
    row.addEventListener('click', () => go('lookup', q.symbol))

    const colorClass = changeColor(q.pct)
    const spark = sparklines?.[q.symbol]
    const sparkHTML = spark ? sparklineSVG(spark, { width: 40, height: 16 }) : ''

    row.innerHTML = `<span class="font-mono text-xs font-medium text-zinc-300 w-10 shrink-0">${esc(q.symbol)}</span>`
      + `<span class="max-lg:hidden flex-1 min-w-0">${sparkHTML}</span>`
      + `<span class="max-lg:hidden flex flex-col items-end shrink-0">`
      + `<span class="font-mono text-xs text-zinc-300">${fmtPrice(q.price)}</span>`
      + `<span class="font-mono text-[10px] ${colorClass}">${fmtPct(q.pct)}</span></span>`
    watchlistEl.appendChild(row)
  }

  buildPulse(quotes)
}

function buildPulse(quotes) {
  if (!pulseEl || !quotes?.length) return
  const pcts = quotes.map(q => q.pct).filter(p => p != null)
  const adv = pcts.filter(p => p > 0).length
  const dec = pcts.filter(p => p < 0).length
  const sorted = [...pcts].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  const maxAbs = Math.max(...pcts.map(Math.abs))

  pulseEl.innerHTML = `<div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Pulse</div>`
    + `<div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">`
    + `<span class="text-zinc-500">Adv / Dec</span>`
    + `<span class="text-right font-mono"><span class="text-positive">${adv}</span> / <span class="text-negative">${dec}</span></span>`
    + `<span class="text-zinc-500">Median</span>`
    + `<span class="text-right font-mono ${changeColor(median)}">${fmtPct(median)}</span>`
    + `<span class="text-zinc-500">Big Move</span>`
    + `<span class="text-right font-mono text-zinc-300">${fmtPct(maxAbs)}</span></div>`
}
