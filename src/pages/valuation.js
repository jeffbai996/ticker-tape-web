// Valuation page: multi-stock comparison table sorted by P/E.

import { loadQuotes, loadMeta, fetchData } from '../lib/data.js'
import { fmtCap, fmtPct } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el) {
  const [quotes, meta] = await Promise.all([loadQuotes(), loadMeta()])

  if (!quotes?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No data available. Waiting for data pipeline...'
    el.appendChild(msg)
    return
  }

  const names = meta?.names || {}

  // Load lookup data for all symbols in parallel
  const symbols = quotes.map(q => q.symbol)
  const lookups = await Promise.all(
    symbols.map(sym => fetchData(`lookup/${sym}.json`).then(d => [sym, d]))
  )
  const lookupMap = Object.fromEntries(lookups.filter(([, d]) => d))

  // Build rows with valuation data
  const rows = symbols
    .filter(sym => lookupMap[sym])
    .map(sym => {
      const d = lookupMap[sym]
      return {
        symbol: sym,
        name: names[sym] || d.shortName || d.longName || '',
        pe: d.trailingPE,
        ps: d.priceToSalesTrailing12Months,
        peg: d.pegRatio,
        evEbitda: d.enterpriseToEbitda,
        marketCap: d.marketCap,
        revGrowth: d.revenueGrowth,
      }
    })
    // Sort by P/E ascending, nulls last
    .sort((a, b) => {
      if (a.pe == null && b.pe == null) return 0
      if (a.pe == null) return 1
      if (b.pe == null) return -1
      return a.pe - b.pe
    })

  const container = document.createElement('div')
  container.className = 'p-4 fade-in'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between mb-4'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Valuation Comparison'
  const count = document.createElement('span')
  count.className = 'text-xs text-zinc-500'
  count.textContent = `${rows.length} symbols \u2022 sorted by P/E`
  header.append(h1, count)

  // Table card
  const card = document.createElement('div')
  card.className = 'card p-3'

  const tableWrap = document.createElement('div')
  tableWrap.className = 'overflow-x-auto'

  const table = document.createElement('table')
  table.className = 'w-full text-xs'

  // Table header
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  headRow.className = 'text-zinc-500 border-b border-zinc-800'
  const columns = ['Symbol', 'P/E', 'P/S', 'PEG', 'EV/EBITDA', 'Market Cap', 'Rev Growth']
  for (const col of columns) {
    const th = document.createElement('th')
    th.className = 'py-1.5 px-2 text-right first:text-left font-medium'
    th.textContent = col
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)

  // Table body
  const tbody = document.createElement('tbody')
  for (const r of rows) {
    const tr = document.createElement('tr')
    tr.className = 'border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition-colors'
    tr.addEventListener('click', () => go('lookup', r.symbol))

    // Symbol cell
    const symTd = document.createElement('td')
    symTd.className = 'py-1.5 px-2 text-left'
    const symSpan = document.createElement('span')
    symSpan.className = 'font-mono font-semibold text-amber-400'
    symSpan.textContent = r.symbol
    const nameSpan = document.createElement('span')
    nameSpan.className = 'text-zinc-600 ml-2 hidden sm:inline'
    nameSpan.textContent = r.name
    symTd.append(symSpan, nameSpan)

    // Value cells
    const peTd = valCell(fmtVal(r.pe))
    const psTd = valCell(fmtVal(r.ps))
    const pegTd = valCell(fmtVal(r.peg))
    const evTd = valCell(fmtVal(r.evEbitda))
    const capTd = valCell(fmtCap(r.marketCap))
    const growthTd = valCell(fmtPctVal(r.revGrowth), growthColor(r.revGrowth))

    tr.append(symTd, peTd, psTd, pegTd, evTd, capTd, growthTd)
    tbody.appendChild(tr)
  }

  table.append(thead, tbody)
  tableWrap.appendChild(table)
  card.appendChild(tableWrap)

  if (!rows.length) {
    const empty = document.createElement('p')
    empty.className = 'text-zinc-500 text-sm py-4 text-center'
    empty.textContent = 'No lookup data available. Fundamentals may not be fetched yet.'
    card.appendChild(empty)
  }

  container.append(header, card)
  el.textContent = ''
  el.appendChild(container)
}

function valCell(text, colorClass = 'text-zinc-200') {
  const td = document.createElement('td')
  td.className = `py-1.5 px-2 text-right font-mono ${colorClass}`
  td.textContent = text
  return td
}

function fmtVal(n) {
  if (n == null || isNaN(n)) return '\u2014'
  return Number(n).toFixed(2)
}

function fmtPctVal(n) {
  if (n == null || isNaN(n)) return '\u2014'
  return (Number(n) * 100).toFixed(1) + '%'
}

function growthColor(n) {
  if (n == null || isNaN(n)) return 'text-zinc-400'
  return Number(n) > 0 ? 'text-positive' : 'text-negative'
}
