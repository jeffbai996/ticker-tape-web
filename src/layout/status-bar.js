// Top status bar: scrolling market indices + market state badge + ET clock.
// innerHTML usage: renders data from our own pre-built JSON files, not user input.

import { loadMarket, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtPct, changeColor, formatTime } from '../lib/format.js'

let barEl = null
let tickerEl = null
let stateEl = null
let clockEl = null

const STATUS_COLORS = {
  pre:    'bg-purple-500/20 text-purple-400',
  open:   'bg-green-500/20 text-green-400',
  post:   'bg-blue-500/20 text-blue-400',
  closed: 'bg-red-500/20 text-red-400',
}

export function initStatusBar(el) {
  barEl = el
  barEl.className = 'h-8 bg-zinc-900 border-b border-zinc-800 flex items-center overflow-hidden shrink-0 relative z-30 text-xs'

  tickerEl = document.createElement('div')
  tickerEl.className = 'flex-1 overflow-hidden relative h-full'

  const rightSide = document.createElement('div')
  rightSide.className = 'flex items-center gap-2 px-3 shrink-0 border-l border-zinc-800 h-full'

  stateEl = document.createElement('span')
  stateEl.className = 'badge bg-zinc-800 text-zinc-400'
  stateEl.textContent = '...'

  clockEl = document.createElement('span')
  clockEl.className = 'font-mono text-zinc-500 w-[5.5em] text-right'
  clockEl.textContent = '--:--:--'

  const chatBtn = document.createElement('button')
  chatBtn.className = 'text-zinc-500 hover:text-zinc-300 transition-colors ml-1'
  chatBtn.title = 'Toggle AI Chat (Ctrl+J)'
  chatBtn.textContent = '💬'
  chatBtn.addEventListener('click', () => document.dispatchEvent(new Event('toggle-chat')))

  const settingsBtn = document.createElement('button')
  settingsBtn.className = 'text-zinc-500 hover:text-zinc-300 transition-colors'
  settingsBtn.title = 'Settings'
  settingsBtn.textContent = '⚙'
  settingsBtn.addEventListener('click', () => document.dispatchEvent(new Event('open-settings')))

  rightSide.append(stateEl, clockEl, chatBtn, settingsBtn)
  barEl.append(tickerEl, rightSide)

  refresh()
  startClock()
  setInterval(refresh, 30_000)
}

async function refresh() {
  const [market, meta] = await Promise.all([loadMarket(), loadMeta()])

  if (meta) {
    const state = meta.market_state || 'closed'
    const label = meta.holiday || state.toUpperCase()
    stateEl.className = `badge ${STATUS_COLORS[state] || STATUS_COLORS.closed}`
    stateEl.textContent = label
  }

  if (!market) return

  const picks = []
  for (const cat of ['US Equity', 'Rates & Vol', 'Key Commodities', 'FX', 'Crypto']) {
    if (market[cat]) picks.push(...market[cat])
  }

  // Build ticker items — data from our own JSON, safe to render
  const items = picks.map(item => {
    const color = changeColor(item.pct)
    return `<span class="inline-flex items-center gap-1.5 px-3 whitespace-nowrap">`
      + `<span class="text-zinc-500">${item.name}</span>`
      + `<span class="font-mono ${color}">${fmtPrice(item.price, item.price < 10 ? 4 : 2)}</span>`
      + `<span class="font-mono ${color}">${fmtPct(item.pct)}</span>`
      + `</span>`
  }).join('')

  tickerEl.innerHTML = `<div class="ticker-scroll flex items-center h-full whitespace-nowrap">${items}${items}</div>`
}

function startClock() {
  const tick = () => { clockEl.textContent = formatTime(new Date()) + ' ET' }
  tick()
  setInterval(tick, 1000)
}
