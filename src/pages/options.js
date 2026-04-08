// Options page: options chain — requires live IBKR connection.

import { loadMeta, loadQuotes } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, changeColor } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }

  symbol = symbol.toUpperCase()
  const [meta, quotes] = await Promise.all([loadMeta(), loadQuotes()])

  const name = meta?.names?.[symbol] || ''
  const quote = quotes?.find(q => q.symbol === symbol)

  const container = document.createElement('div')
  container.className = 'p-4 fade-in'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center gap-3 mb-4 flex-wrap'
  const symEl = document.createElement('span')
  symEl.className = 'font-mono text-xl font-bold text-amber-400 cursor-pointer'
  symEl.textContent = symbol
  symEl.addEventListener('click', () => go('lookup', symbol))
  const nameEl = document.createElement('span')
  nameEl.className = 'text-sm text-zinc-400'
  nameEl.textContent = name
  header.append(symEl, nameEl)

  if (quote) {
    const priceEl = document.createElement('span')
    priceEl.className = 'font-mono text-xl font-extrabold text-zinc-100 ml-auto'
    priceEl.textContent = fmtPrice(quote.price)
    const chgEl = document.createElement('span')
    chgEl.className = `font-mono text-sm ${changeColor(quote.pct)}`
    chgEl.textContent = fmtChange(quote.change)
    const pctEl = document.createElement('span')
    pctEl.className = `font-mono text-sm font-semibold ${changeColor(quote.pct)}`
    pctEl.textContent = fmtPct(quote.pct)
    header.append(priceEl, chgEl, pctEl)
  }

  // Nav buttons
  const navRow = document.createElement('div')
  navRow.className = 'flex gap-2 mb-4 flex-wrap'
  for (const [page, label] of [['chart', 'Chart'], ['lookup', 'Lookup'], ['technicals', 'Technicals']]) {
    const btn = document.createElement('button')
    btn.className = 'px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors'
    btn.textContent = label
    btn.addEventListener('click', () => go(page, symbol))
    navRow.appendChild(btn)
  }

  // Explanation card
  const card = document.createElement('div')
  card.className = 'card p-6 text-center'
  const icon = document.createElement('div')
  icon.className = 'text-3xl text-zinc-600 mb-3'
  icon.textContent = '\u2696\uFE0F'
  const msg = document.createElement('p')
  msg.className = 'text-zinc-400 text-sm mb-2'
  msg.textContent = 'Options data requires live IBKR connection.'
  const sub = document.createElement('p')
  sub.className = 'text-zinc-600 text-xs leading-relaxed max-w-md mx-auto'
  sub.textContent = 'Options chain data (strikes, expiries, greeks, IV) is not available through the static data pipeline. A live Interactive Brokers connection via the terminal application is required to stream real-time options data.'
  card.append(icon, msg, sub)

  // Feature list
  const features = document.createElement('div')
  features.className = 'mt-4 pt-4 border-t border-zinc-800 text-left max-w-sm mx-auto'
  const featTitle = document.createElement('p')
  featTitle.className = 'text-xs text-zinc-500 font-semibold uppercase tracking-wider mb-2'
  featTitle.textContent = 'Available via IBKR Terminal'
  const items = [
    'Full options chain by expiry',
    'Greeks (delta, gamma, theta, vega)',
    'Implied volatility surface',
    'Open interest and volume',
    'Bid/ask spreads',
  ]
  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'flex items-center gap-2 py-0.5'
    const dot = document.createElement('span')
    dot.className = 'text-zinc-700 text-xs'
    dot.textContent = '\u2022'
    const text = document.createElement('span')
    text.className = 'text-xs text-zinc-500'
    text.textContent = item
    row.append(dot, text)
    features.appendChild(row)
  }
  card.appendChild(features)

  container.append(header, navRow, card)
  el.textContent = ''
  el.appendChild(container)
}
