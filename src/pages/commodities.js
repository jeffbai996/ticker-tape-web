// Commodities: futures prices grid.

import { loadCommodities, loadMarket, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, changeColor, changeBg } from '../lib/format.js'

export async function render(el) {
  const [commodities, market, meta] = await Promise.all([
    loadCommodities(), loadMarket(), loadMeta()
  ])

  // Commodities might be standalone array, category map, or in market.json
  const items = parseCommodities(commodities, market)

  if (!items?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No commodities data available.'
    el.appendChild(msg)
    return
  }

  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Commodities & Futures'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Grid of commodity tiles
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'

  for (const item of items) {
    const tile = document.createElement('div')
    tile.className = `card p-4 ${changeBg(item.pct)}`

    // Name
    const nameEl = document.createElement('div')
    nameEl.className = 'text-sm font-medium text-zinc-200 truncate'
    nameEl.textContent = item.name || item.symbol || '—'

    // Symbol
    const symbolEl = document.createElement('div')
    symbolEl.className = 'text-xs font-mono text-zinc-500 mt-0.5'
    symbolEl.textContent = item.symbol || ''

    // Price
    const priceEl = document.createElement('div')
    priceEl.className = 'font-mono text-2xl font-extrabold text-zinc-100 mt-2'
    priceEl.textContent = fmtPrice(item.price, item.price < 10 ? 4 : 2)

    // Change row
    const changeRow = document.createElement('div')
    changeRow.className = 'flex items-baseline gap-2 mt-1'
    const chgEl = document.createElement('span')
    chgEl.className = `font-mono text-sm ${changeColor(item.change)}`
    chgEl.textContent = fmtChange(item.change)
    const pctEl = document.createElement('span')
    pctEl.className = `font-mono text-sm font-semibold ${changeColor(item.pct)}`
    pctEl.textContent = fmtPct(item.pct)
    changeRow.append(chgEl, pctEl)

    tile.append(nameEl, symbolEl, priceEl, changeRow)
    grid.appendChild(tile)
  }

  container.appendChild(grid)
  el.textContent = ''
  el.appendChild(container)
}

/** Extract commodity items from various data shapes */
function parseCommodities(commodities, market) {
  // Direct array
  if (Array.isArray(commodities)) return commodities

  // Category map
  if (commodities && typeof commodities === 'object') {
    const all = []
    for (const [, items] of Object.entries(commodities)) {
      if (Array.isArray(items)) all.push(...items)
    }
    if (all.length) return all
  }

  // Fallback: pull from market.json
  if (market && typeof market === 'object') {
    const keys = ['Key Commodities', 'Commodities', 'Futures']
    for (const key of keys) {
      if (market[key]?.length) return market[key]
    }
  }

  return []
}
