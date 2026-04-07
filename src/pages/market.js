// Market overview: indices by category, rates, FX, commodities, crypto.

import { loadMarket, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtPct, changeColor, changeBg, esc } from '../lib/format.js'

const CATEGORY_ORDER = ['US Equity', 'US Futures', 'Europe', 'Asia-Pacific', 'Americas', 'Rates & Vol', 'FX', 'Key Commodities', 'Crypto']

export async function render(el) {
  const [market, meta] = await Promise.all([loadMarket(), loadMeta()])

  if (!market) {
    el.textContent = 'No market data available.'
    return
  }

  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Market Overview'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Category sections
  for (const cat of CATEGORY_ORDER) {
    const items = market[cat]
    if (!items?.length) continue

    const section = document.createElement('div')
    section.className = 'card p-3'

    const catTitle = document.createElement('h2')
    catTitle.className = 'text-xs font-semibold uppercase tracking-wider text-info mb-2'
    catTitle.textContent = cat

    const grid = document.createElement('div')
    grid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2'

    for (const item of items) {
      const tile = document.createElement('div')
      tile.className = `rounded-md p-2 ${changeBg(item.pct)}`

      const name = document.createElement('div')
      name.className = 'text-xs text-zinc-400 truncate'
      name.textContent = item.name

      const priceEl = document.createElement('div')
      priceEl.className = 'font-mono text-sm font-semibold mt-0.5'
      // Compact formatting for large numbers
      const p = item.price
      priceEl.textContent = p >= 10000 ? Math.round(p).toLocaleString() : fmtPrice(p, p < 10 ? 4 : 2)
      const pctEl = document.createElement('div')
      pctEl.className = `font-mono text-xs font-semibold ${changeColor(item.pct)}`
      pctEl.textContent = fmtPct(item.pct)

      tile.append(name, priceEl, pctEl)
      grid.appendChild(tile)
    }

    section.append(catTitle, grid)
    container.appendChild(section)
  }

  el.textContent = ''
  el.appendChild(container)
}
