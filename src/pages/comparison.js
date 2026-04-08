// Multi-symbol comparison: sparklines side by side with stats.

import { loadSparklines, loadQuotes, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, changeColor, sparklineSVG } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, param) {
  const [sparklines, quotes, meta] = await Promise.all([
    loadSparklines(), loadQuotes(), loadMeta()
  ])

  if (!sparklines || !Object.keys(sparklines).length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No sparkline data available for comparison.'
    el.appendChild(msg)
    return
  }

  // Determine symbols: from param (comma-separated) or all available
  let symbols
  if (param) {
    symbols = param.toUpperCase().split(',').map(s => s.trim()).filter(Boolean)
  } else {
    // Use watchlist order from quotes, fall back to sparkline keys
    symbols = quotes?.length
      ? quotes.map(q => q.symbol).filter(s => sparklines[s])
      : Object.keys(sparklines)
  }

  // Build quote lookup
  const quoteMap = {}
  if (quotes) {
    for (const q of quotes) quoteMap[q.symbol] = q
  }

  const container = document.createElement('div')
  container.className = 'p-4 fade-in space-y-4'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = param ? `Comparing: ${symbols.join(', ')}` : 'Watchlist Comparison'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Comparison grid
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3'

  for (const sym of symbols) {
    const prices = sparklines[sym]
    if (!prices?.length) continue

    const q = quoteMap[sym]
    const card = document.createElement('div')
    card.className = 'card p-3 cursor-pointer card-clickable'
    card.addEventListener('click', () => go('lookup', sym))

    // Symbol
    const symEl = document.createElement('div')
    symEl.className = 'font-mono text-sm font-semibold text-amber-400'
    symEl.textContent = sym

    // Price + change
    if (q) {
      const priceRow = document.createElement('div')
      priceRow.className = 'flex items-baseline gap-2 mt-1'
      const priceEl = document.createElement('span')
      priceEl.className = 'font-mono text-lg font-extrabold text-zinc-100'
      priceEl.textContent = fmtPrice(q.price)
      const chgEl = document.createElement('span')
      chgEl.className = `font-mono text-xs ${changeColor(q.pct)}`
      chgEl.textContent = fmtChange(q.change)
      const pctEl = document.createElement('span')
      pctEl.className = `font-mono text-xs font-semibold ${changeColor(q.pct)}`
      pctEl.textContent = fmtPct(q.pct)
      priceRow.append(priceEl, chgEl, pctEl)
      card.append(symEl, priceRow)
    } else {
      card.appendChild(symEl)
    }

    // Sparkline
    const sparkDiv = document.createElement('div')
    sparkDiv.className = 'mt-2 h-10'
    sparkDiv.innerHTML = sparklineSVG(prices, { width: 280, height: 40 })
    card.appendChild(sparkDiv)

    // Stats row
    const statsRow = document.createElement('div')
    statsRow.className = 'flex justify-between mt-2 text-[10px] text-zinc-500 font-mono'

    const minVal = Math.min(...prices.filter(p => p != null))
    const maxVal = Math.max(...prices.filter(p => p != null))
    const range = maxVal - minVal
    const rangePct = minVal > 0 ? (range / minVal) * 100 : 0

    const lowEl = document.createElement('span')
    lowEl.textContent = `L: ${fmtPrice(minVal)}`
    const highEl = document.createElement('span')
    highEl.textContent = `H: ${fmtPrice(maxVal)}`
    const rangeEl = document.createElement('span')
    rangeEl.textContent = `R: ${rangePct.toFixed(1)}%`
    statsRow.append(lowEl, highEl, rangeEl)
    card.appendChild(statsRow)

    grid.appendChild(card)
  }

  container.appendChild(grid)
  el.textContent = ''
  el.appendChild(container)
}
