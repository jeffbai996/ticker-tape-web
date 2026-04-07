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

const CHAT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`

const SETTINGS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1.08 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1.08z"/></svg>`

export function initStatusBar(el) {
  barEl = el
  barEl.className = 'h-8 bg-zinc-900 border-b border-zinc-800 flex items-center overflow-hidden shrink-0 relative z-30 text-xs'

  // Left side: market state badge, then scrolling ticker
  stateEl = document.createElement('span')
  stateEl.className = 'badge bg-zinc-800 text-zinc-400 shrink-0 mx-2'
  stateEl.textContent = '...'

  tickerEl = document.createElement('div')
  tickerEl.className = 'flex-1 overflow-hidden relative h-full'

  // Right side: clock, chat, settings
  const rightSide = document.createElement('div')
  rightSide.className = 'flex items-center gap-2 px-3 shrink-0 border-l border-zinc-800 h-full'

  clockEl = document.createElement('span')
  clockEl.className = 'font-mono text-zinc-500 whitespace-nowrap'
  clockEl.textContent = '--:--:-- ET'

  const chatBtn = document.createElement('button')
  chatBtn.className = 'text-zinc-500 hover:text-zinc-300 transition-colors ml-1'
  chatBtn.title = 'Toggle AI Chat (Ctrl+J)'
  chatBtn.innerHTML = CHAT_SVG
  chatBtn.addEventListener('click', () => document.dispatchEvent(new Event('toggle-chat')))

  const settingsBtn = document.createElement('button')
  settingsBtn.className = 'text-zinc-500 hover:text-zinc-300 transition-colors'
  settingsBtn.title = 'Settings'
  settingsBtn.innerHTML = SETTINGS_SVG
  settingsBtn.addEventListener('click', () => document.dispatchEvent(new Event('open-settings')))

  rightSide.append(clockEl, chatBtn, settingsBtn)
  barEl.append(stateEl, tickerEl, rightSide)

  refresh()
  startClock()
  setInterval(refresh, 30_000)
}

async function refresh() {
  const [market, meta] = await Promise.all([loadMarket(), loadMeta()])

  if (meta) {
    const state = meta.market_state || 'closed'
    const label = meta.holiday || state.toUpperCase()
    stateEl.className = `badge ${STATUS_COLORS[state] || STATUS_COLORS.closed} shrink-0 mx-2`
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

  tickerEl.innerHTML = `<div class="ticker-scroll flex items-center h-full whitespace-nowrap">${items}<span class="px-8"></span>${items}<span class="px-8"></span></div>`
}

function startClock() {
  const tick = () => { clockEl.textContent = formatTime(new Date()) + ' ET' }
  tick()
  setInterval(tick, 1000)
}
