// Sector ETF heatmap: colored tiles for each sector ETF.

import { loadSectors, loadMarket, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtPct, changeColor, changeBg } from '../lib/format.js'

export async function render(el) {
  const [sectors, market, meta] = await Promise.all([
    loadSectors(), loadMarket(), loadMeta()
  ])

  // Sectors data might be standalone or embedded in market.json categories
  const items = parseSectors(sectors, market)

  if (!items?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No sector data available.'
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
  h1.textContent = 'Sector Heatmap'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Heatmap grid
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3'

  for (const item of items) {
    const tile = document.createElement('div')
    tile.className = `card p-4 ${changeBg(item.pct)} transition-colors`

    const nameEl = document.createElement('div')
    nameEl.className = 'text-sm font-medium text-zinc-200 truncate'
    nameEl.textContent = item.name || item.symbol || '—'

    const symbolEl = document.createElement('div')
    symbolEl.className = 'text-xs font-mono text-zinc-500 mt-0.5'
    symbolEl.textContent = item.symbol || ''

    const priceRow = document.createElement('div')
    priceRow.className = 'flex items-baseline justify-between mt-2'
    const priceEl = document.createElement('span')
    priceEl.className = 'font-mono text-lg font-semibold text-zinc-100'
    priceEl.textContent = fmtPrice(item.price)
    const pctEl = document.createElement('span')
    pctEl.className = `font-mono text-sm font-semibold ${changeColor(item.pct)}`
    pctEl.textContent = fmtPct(item.pct)
    priceRow.append(priceEl, pctEl)

    // Change bar — visual indicator of magnitude
    const barWrap = document.createElement('div')
    barWrap.className = 'mt-2 h-1.5 bg-zinc-800 rounded-full overflow-hidden'
    const bar = document.createElement('div')
    const absPct = Math.min(Math.abs(item.pct || 0), 5)
    const barWidth = (absPct / 5) * 100
    bar.className = `h-full rounded-full ${item.pct >= 0 ? 'bg-green-500' : 'bg-red-500'}`
    bar.style.width = `${barWidth}%`
    barWrap.appendChild(bar)

    tile.append(nameEl, symbolEl, priceRow, barWrap)
    grid.appendChild(tile)
  }

  container.appendChild(grid)
  el.textContent = ''
  el.appendChild(container)
}

/** Extract sector items from sectors.json or market.json fallback */
function parseSectors(sectors, market) {
  // If sectors.json is an array of items, use directly
  if (Array.isArray(sectors)) return sectors

  // If sectors.json is a category map (like market.json), flatten sector categories
  if (sectors && typeof sectors === 'object') {
    const all = []
    for (const [cat, items] of Object.entries(sectors)) {
      if (Array.isArray(items)) all.push(...items)
    }
    if (all.length) return all
  }

  // Fallback: pull sector-related categories from market.json
  if (market && typeof market === 'object') {
    const sectorKeys = ['Sectors', 'Sector ETFs', 'US Sectors']
    for (const key of sectorKeys) {
      if (market[key]?.length) return market[key]
    }
  }

  return []
}
