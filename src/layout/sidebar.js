// Sidebar: navigation + watchlist + market pulse.
// innerHTML: renders data from our own JSON files, not user input.

import { loadQuotes, loadSparklines, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtPct, changeColor, sparklineSVG, esc } from '../lib/format.js'
import { addToWatchlist } from '../lib/watchlist.js'
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
    const sparkHTML = spark ? sparklineSVG(spark, { width: 60, height: 14 }) : ''

    row.innerHTML = `<span class="font-mono text-xs font-bold text-zinc-300 w-10 shrink-0">${esc(q.symbol)}</span>`
      + `<span class="max-lg:hidden flex-1 min-w-0 overflow-hidden h-3.5">${sparkHTML}</span>`
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

  let html = `<div class="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-1">Pulse</div>`
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
