// Command palette: Cmd+K fuzzy search for navigation, symbols, and commands.

import { go } from '../router.js'
import { loadMeta } from '../lib/data.js'

let paletteEl = null
let inputEl = null
let resultsEl = null
let selectedIdx = 0
let currentItems = []

// Bloomberg-style abbreviations included in keys for quick navigation
const PAGES = [
  { id: 'dashboard',   label: 'Dashboard',        desc: 'Portfolio overview',       keys: 'dashboard home thesis t port' },
  { id: 'market',      label: 'Market Overview',   desc: 'Indices, rates, FX',       keys: 'market m indices wei wcix' },
  { id: 'sectors',     label: 'Sectors',           desc: 'Sector ETF performance',   keys: 'sectors s xlk smh secf bi' },
  { id: 'earnings',    label: 'Earnings',          desc: 'Earnings calendar',        keys: 'earnings e eps ee ern' },
  { id: 'heatmap',     label: 'Heatmap',           desc: 'Watchlist heatmap',        keys: 'heatmap hm heat imap' },
  { id: 'commodities', label: 'Commodities',       desc: 'Futures prices',           keys: 'commodities com oil gold cmdx' },
  { id: 'calendar',    label: 'Econ Calendar',     desc: 'FOMC, CPI, NFP, GDP',      keys: 'calendar cal econ fomc cpi eco ecow' },
  { id: 'correlation', label: 'Correlation',       desc: 'Correlation matrix',       keys: 'correlation cor matrix corr' },
  { id: 'comparison',  label: 'Comparison',        desc: 'Multi-symbol comparison',  keys: 'comparison compare vs comp' },
  { id: 'valuation',   label: 'Valuation',         desc: 'Multi-stock valuation',    keys: 'valuation val pe ps rvp' },
  { id: 'news',        label: 'News',              desc: 'Headlines',                keys: 'news n headlines top nws' },
  { id: 'terminal',    label: 'Terminal',          desc: 'Bloomberg-style CLI',       keys: 'terminal term cli cmd' },
]

const SYMBOL_PAGES = [
  { id: 'lookup',     label: 'Lookup',         desc: 'Symbol fundamentals',    keys: 'lookup l fundamentals info des fa' },
  { id: 'chart',      label: 'Chart',          desc: 'Candlestick chart',      keys: 'chart c candle gp gpx' },
  { id: 'technicals', label: 'Technicals',     desc: 'SMA / RSI / MACD',       keys: 'technicals ta rsi macd tav' },
  { id: 'intraday',   label: 'Intraday',       desc: '5-min bars + VWAP',      keys: 'intraday id vwap gip' },
  { id: 'dividends',  label: 'Dividends',      desc: 'Yield, ex-date, payout', keys: 'dividends div yield dvd' },
  { id: 'short',      label: 'Short Interest',  desc: 'Short data',            keys: 'short shorts si' },
  { id: 'ratings',    label: 'Ratings',         desc: 'Analyst consensus',     keys: 'ratings rat analyst anr' },
  { id: 'insider',    label: 'Insider',         desc: 'Insider transactions',  keys: 'insider ins' },
  { id: 'impact',     label: 'Impact',          desc: 'Earnings impact',       keys: 'impact imp earnings' },
  { id: 'options',    label: 'Options',         desc: 'Options chain',         keys: 'options opt chain iv omon' },
]

// Bloomberg shortcut map — direct command → page resolution
const BLOOMBERG_SHORTCUTS = {
  wei:  'market',     // World Equity Indices
  wcix: 'market',     // World Currency Indices
  top:  'news',       // Top News
  nws:  'news',       // News
  eco:  'calendar',   // Economic Calendar
  ecow: 'calendar',   // Economic Calendar Weekly
  ee:   'earnings',   // Earnings Estimates
  ern:  'earnings',   // Earnings
  fa:   'lookup',     // Financial Analysis (needs symbol)
  des:  'lookup',     // Description (needs symbol)
  gp:   'chart',      // Graph/Price (needs symbol)
  gpx:  'chart',      // Graph Extended
  gip:  'intraday',   // Graph Intraday
  tav:  'technicals', // Technical Analysis
  dvd:  'dividends',  // Dividends
  anr:  'ratings',    // Analyst Recommendations
  omon: 'options',    // Options Monitor
  port: 'dashboard',  // Portfolio
  comp: 'comparison', // Comparative Returns
  corr: 'correlation',// Correlation
  rvp:  'valuation',  // Relative Value/Performance
  secf: 'sectors',    // Sector Finder
  imap: 'heatmap',    // Industry Map
  cmdx: 'commodities',// Commodity Index
}

export { BLOOMBERG_SHORTCUTS }

export function initCommandPalette(el) {
  paletteEl = el
  document.addEventListener('open-palette', () => openPalette())
}

function openPalette() {
  paletteEl.className = 'palette-overlay'
  paletteEl.textContent = ''

  const backdrop = document.createElement('div')
  backdrop.className = 'absolute inset-0'
  backdrop.addEventListener('click', closePalette)

  const modal = document.createElement('div')
  modal.className = 'relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden fade-in'

  inputEl = document.createElement('input')
  inputEl.type = 'text'
  inputEl.placeholder = 'Search pages, symbols, commands...'
  inputEl.className = 'w-full bg-transparent border-b border-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none'
  inputEl.addEventListener('input', () => doSearch(inputEl.value))
  inputEl.addEventListener('keydown', handleKeyDown)

  resultsEl = document.createElement('div')
  resultsEl.className = 'max-h-80 overflow-y-auto py-1'

  modal.append(inputEl, resultsEl)
  paletteEl.append(backdrop, modal)
  inputEl.focus()
  doSearch('')
}

function closePalette() {
  paletteEl.className = 'hidden'
  paletteEl.textContent = ''
}

async function doSearch(query) {
  const q = query.toLowerCase().trim()
  const items = []
  const isSymbolQuery = /^[A-Z]{1,5}$/i.test(query.trim())

  // Handle "page SYMBOL" patterns like "chart NVDA"
  const parts = q.split(/\s+/)
  if (parts.length >= 2) {
    const cmd = parts[0]
    const sym = parts.slice(1).join('').toUpperCase()
    const matched = SYMBOL_PAGES.find(p => p.keys.includes(cmd) || p.id === cmd)
    if (matched && sym) {
      items.push({
        type: 'action', label: `${matched.label}: ${sym}`, desc: matched.desc,
        action: () => { closePalette(); go(matched.id, sym) },
      })
    }
  }

  // Symbol search
  if (isSymbolQuery && q.length >= 1) {
    const meta = await loadMeta()
    const names = meta?.names || {}
    const matching = Object.keys(names).filter(s => s.toLowerCase().startsWith(q)).slice(0, 6)
    for (const sym of matching) {
      items.push({
        type: 'symbol', label: sym, desc: names[sym] || '',
        action: () => { closePalette(); go('lookup', sym) },
      })
    }
  }

  // Match pages
  for (const page of PAGES) {
    if (!q || page.keys.includes(q) || page.label.toLowerCase().includes(q)) {
      items.push({
        type: 'page', label: page.label, desc: page.desc,
        action: () => { closePalette(); go(page.id) },
      })
    }
  }

  // Match symbol-specific pages
  if (q) {
    for (const page of SYMBOL_PAGES) {
      if (page.keys.includes(q) || page.label.toLowerCase().includes(q)) {
        items.push({
          type: 'action', label: page.label, desc: `${page.desc} — type symbol after`,
          action: () => { inputEl.value = page.id + ' '; inputEl.focus() },
        })
      }
    }
  }

  currentItems = items.slice(0, 12)
  selectedIdx = 0
  renderResults()
}

function renderResults() {
  resultsEl.textContent = ''
  if (!currentItems.length) {
    const empty = document.createElement('div')
    empty.className = 'px-4 py-6 text-center text-sm text-zinc-500'
    empty.textContent = 'No results found'
    resultsEl.appendChild(empty)
    return
  }

  currentItems.forEach((item, i) => {
    const row = document.createElement('button')
    row.className = `w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${i === selectedIdx ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50'}`

    const icon = document.createElement('span')
    icon.className = 'text-xs text-zinc-600 w-4 text-center shrink-0'
    icon.textContent = item.type === 'symbol' ? '◆' : item.type === 'page' ? '→' : '⚡'

    const label = document.createElement('span')
    label.className = 'font-medium text-zinc-200'
    label.textContent = item.label

    const desc = document.createElement('span')
    desc.className = 'text-xs text-zinc-500 ml-auto'
    desc.textContent = item.desc

    row.append(icon, label, desc)
    row.addEventListener('click', item.action)
    resultsEl.appendChild(row)
  })
}

function handleKeyDown(e) {
  if (e.key === 'Escape') { e.preventDefault(); closePalette() }
  else if (e.key === 'ArrowDown') { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, currentItems.length - 1); renderResults() }
  else if (e.key === 'ArrowUp') { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); renderResults() }
  else if (e.key === 'Enter') { e.preventDefault(); currentItems[selectedIdx]?.action() }
}
