// Impact page: Earnings impact history. Placeholder — data not yet in pipeline.

import { loadQuotes } from '../lib/data.js'
import { go } from '../router.js'

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }
  symbol = symbol.toUpperCase()

  const container = document.createElement('div')
  container.className = 'p-4 fade-in'

  const header = document.createElement('div')
  header.className = 'flex items-center gap-3 mb-4'
  const symEl = document.createElement('span')
  symEl.className = 'font-mono text-xl font-bold text-amber-400 cursor-pointer'
  symEl.textContent = symbol
  symEl.addEventListener('click', () => go('lookup', symbol))
  const titleEl = document.createElement('span')
  titleEl.className = 'text-lg font-semibold text-zinc-100'
  titleEl.textContent = 'Earnings Impact'
  header.append(symEl, titleEl)

  const card = document.createElement('div')
  card.className = 'card p-6 text-center'
  const msg = document.createElement('p')
  msg.className = 'text-zinc-500 text-sm'
  msg.textContent = `Earnings impact data for ${symbol} is not yet available. This feature requires historical earnings move data to be added to the data pipeline.`
  card.appendChild(msg)

  container.append(header, card)
  el.textContent = ''
  el.appendChild(container)
}
