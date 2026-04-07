// Insider page: insider transaction data for a single symbol.

import { loadMeta, loadQuotes, fetchData } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, changeColor } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }

  symbol = symbol.toUpperCase()
  const [insiderData, meta, quotes] = await Promise.all([
    fetchData(`insider/${symbol}.json`), loadMeta(), loadQuotes()
  ])

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
    priceEl.className = 'font-mono text-xl font-semibold text-zinc-100 ml-auto'
    priceEl.textContent = fmtPrice(quote.price)
    const chgEl = document.createElement('span')
    chgEl.className = `font-mono text-sm ${changeColor(quote.pct)}`
    chgEl.textContent = `${fmtChange(quote.change)}  ${fmtPct(quote.pct)}`
    header.append(priceEl, chgEl)
  }

  // Nav buttons
  const navRow = document.createElement('div')
  navRow.className = 'flex gap-2 mb-4 flex-wrap'
  for (const [page, label] of [['chart', 'Chart'], ['lookup', 'Lookup'], ['short', 'Short']]) {
    const btn = document.createElement('button')
    btn.className = 'px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors'
    btn.textContent = label
    btn.addEventListener('click', () => go(page, symbol))
    navRow.appendChild(btn)
  }

  // Placeholder card
  const card = document.createElement('div')
  card.className = 'card p-6 text-center'
  const icon = document.createElement('div')
  icon.className = 'text-3xl text-zinc-600 mb-3'
  icon.textContent = '\uD83D\uDCCB'
  const msg = document.createElement('p')
  msg.className = 'text-zinc-400 text-sm mb-1'
  msg.textContent = `Insider data not yet available for ${symbol}.`
  const sub = document.createElement('p')
  sub.className = 'text-zinc-600 text-xs'
  sub.textContent = 'Coming soon. Insider transaction tracking will be added to the data pipeline.'
  card.append(icon, msg, sub)

  container.append(header, navRow, card)
  el.textContent = ''
  el.appendChild(container)
}
