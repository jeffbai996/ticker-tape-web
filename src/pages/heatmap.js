// Watchlist performance heatmap: colored tiles sized by magnitude.

import { loadQuotes, loadMeta } from '../lib/data.js'
import { fmtPct, fmtPrice, changeColor } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el) {
  const [quotes, meta] = await Promise.all([loadQuotes(), loadMeta()])

  if (!quotes?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No quote data available.'
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
  h1.textContent = 'Performance Heatmap'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Sort by absolute pct change descending (largest movers first)
  const sorted = [...quotes].sort((a, b) => Math.abs(b.pct || 0) - Math.abs(a.pct || 0))

  // Heatmap grid
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2'

  for (const q of sorted) {
    const tile = document.createElement('div')
    const bgColor = heatBg(q.pct)
    tile.className = `rounded-lg p-3 cursor-pointer transition-transform hover:scale-[1.02] ${bgColor}`
    tile.addEventListener('click', () => go('lookup', q.symbol))

    // Symbol
    const symEl = document.createElement('div')
    symEl.className = 'font-mono text-sm font-bold text-white/90'
    symEl.textContent = q.symbol

    // Price
    const priceEl = document.createElement('div')
    priceEl.className = 'font-mono text-xs text-white/60 mt-0.5'
    priceEl.textContent = fmtPrice(q.price)

    // Percent change — prominent
    const pctEl = document.createElement('div')
    pctEl.className = 'font-mono text-lg font-bold text-white mt-1'
    pctEl.textContent = fmtPct(q.pct)

    tile.append(symEl, priceEl, pctEl)
    grid.appendChild(tile)
  }

  container.appendChild(grid)

  // Legend
  const legend = document.createElement('div')
  legend.className = 'flex items-center justify-center gap-4 text-xs text-zinc-500 pt-2'
  const labels = [
    ['bg-red-700', '<-3%'],
    ['bg-red-600/70', '-1 to -3%'],
    ['bg-zinc-700', '~0%'],
    ['bg-green-600/70', '+1 to +3%'],
    ['bg-green-700', '>+3%'],
  ]
  for (const [bg, label] of labels) {
    const item = document.createElement('div')
    item.className = 'flex items-center gap-1'
    const swatch = document.createElement('div')
    swatch.className = `w-3 h-3 rounded ${bg}`
    const text = document.createElement('span')
    text.textContent = label
    item.append(swatch, text)
    legend.appendChild(item)
  }
  container.appendChild(legend)

  el.textContent = ''
  el.appendChild(container)
}

/** Map percent change to background color with intensity */
function heatBg(pct) {
  if (pct == null || isNaN(pct)) return 'bg-zinc-800'
  const v = Number(pct)
  if (v >= 5)  return 'bg-green-800'
  if (v >= 3)  return 'bg-green-700'
  if (v >= 1)  return 'bg-green-600/70'
  if (v >= 0.25) return 'bg-green-600/40'
  if (v > -0.25) return 'bg-zinc-700'
  if (v > -1)  return 'bg-red-600/40'
  if (v > -3)  return 'bg-red-600/70'
  if (v > -5)  return 'bg-red-700'
  return 'bg-red-800'
}
