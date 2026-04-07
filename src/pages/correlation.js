// Correlation matrix: NxN grid with color-coded cells.

import { loadCorrelation, loadMeta } from '../lib/data.js'

export async function render(el) {
  const [corr, meta] = await Promise.all([loadCorrelation(), loadMeta()])

  if (!corr) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No correlation data available.'
    el.appendChild(msg)
    return
  }

  // Parse correlation data — supports multiple shapes:
  // { symbols: [...], matrix: [[...]] }
  // { SYMBOL: { SYMBOL: 0.95, ... }, ... }
  const { symbols, matrix } = parseCorrelation(corr)

  if (!symbols?.length || !matrix?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'Correlation data format not recognized.'
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
  h1.textContent = 'Correlation Matrix'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)
  container.appendChild(header)

  // Legend
  const legend = document.createElement('div')
  legend.className = 'flex items-center gap-3 text-xs text-zinc-500'
  const legendItems = [
    ['bg-green-600', 'High +'],
    ['bg-green-800/50', 'Moderate +'],
    ['bg-zinc-700', 'Near zero'],
    ['bg-red-800/50', 'Moderate -'],
    ['bg-red-600', 'High -'],
  ]
  for (const [bg, label] of legendItems) {
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

  // Matrix table
  const card = document.createElement('div')
  card.className = 'card overflow-x-auto'

  const table = document.createElement('table')
  table.className = 'w-full border-collapse'

  // Header row
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')

  // Empty corner cell
  const corner = document.createElement('th')
  corner.className = 'p-1 min-w-[48px]'
  headRow.appendChild(corner)

  for (const sym of symbols) {
    const th = document.createElement('th')
    th.className = 'p-1 text-[10px] font-mono text-amber-400 font-semibold text-center min-w-[48px]'
    // Rotate labels for space efficiency
    th.style.writingMode = symbols.length > 8 ? 'vertical-lr' : 'horizontal-tb'
    th.textContent = sym
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)

  // Body rows
  const tbody = document.createElement('tbody')
  for (let i = 0; i < symbols.length; i++) {
    const tr = document.createElement('tr')

    // Row label
    const rowLabel = document.createElement('td')
    rowLabel.className = 'p-1 text-[10px] font-mono text-amber-400 font-semibold text-right pr-2 whitespace-nowrap'
    rowLabel.textContent = symbols[i]
    tr.appendChild(rowLabel)

    for (let j = 0; j < symbols.length; j++) {
      const val = matrix[i]?.[j]
      const td = document.createElement('td')
      const bg = corrBg(val)
      const textColor = Math.abs(val || 0) > 0.5 ? 'text-white/90' : 'text-zinc-400'
      td.className = `p-1 text-center font-mono text-[10px] ${bg} ${textColor} min-w-[48px]`

      if (i === j) {
        // Diagonal — always 1.00
        td.textContent = '1.00'
        td.className = `p-1 text-center font-mono text-[10px] bg-zinc-600 text-zinc-300 min-w-[48px]`
      } else {
        td.textContent = val != null ? val.toFixed(2) : '—'
      }

      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }

  table.append(thead, tbody)
  card.appendChild(table)
  container.appendChild(card)

  el.textContent = ''
  el.appendChild(container)
}

/** Parse correlation data into { symbols, matrix } */
function parseCorrelation(data) {
  // Shape 1: { symbols: [...], matrix: [[...]] }
  if (data.symbols && data.matrix) {
    return { symbols: data.symbols, matrix: data.matrix }
  }

  // Shape 2: { SYMBOL: { SYMBOL: value, ... }, ... }
  if (typeof data === 'object' && !Array.isArray(data)) {
    const symbols = Object.keys(data)
    if (symbols.length && typeof data[symbols[0]] === 'object') {
      const matrix = symbols.map(row =>
        symbols.map(col => data[row]?.[col] ?? null)
      )
      return { symbols, matrix }
    }
  }

  return { symbols: [], matrix: [] }
}

/** Map correlation value to background color */
function corrBg(val) {
  if (val == null) return 'bg-zinc-800'
  const v = Number(val)
  if (v >= 0.8)  return 'bg-green-600'
  if (v >= 0.5)  return 'bg-green-700/60'
  if (v >= 0.2)  return 'bg-green-800/40'
  if (v > -0.2)  return 'bg-zinc-700'
  if (v > -0.5)  return 'bg-red-800/40'
  if (v > -0.8)  return 'bg-red-700/60'
  return 'bg-red-600'
}
