// Intraday page: 5-minute bars + VWAP for a single symbol.

import { loadChart, loadMeta, loadQuotes } from '../lib/data.js'
import { fmtPrice, fmtChange, fmtPct, fmtCompact, changeColor } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }

  symbol = symbol.toUpperCase()
  const [chartData, meta, quotes] = await Promise.all([
    loadChart(symbol), loadMeta(), loadQuotes()
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

  container.append(header, navRow)

  // Check for intraday data (1d timeframe)
  const intraday = chartData?.['1d']
  if (!intraday?.length) {
    const notice = document.createElement('div')
    notice.className = 'card p-6 text-center'
    const icon = document.createElement('div')
    icon.className = 'text-3xl text-zinc-600 mb-3'
    icon.textContent = '\u23F1'
    const msg = document.createElement('p')
    msg.className = 'text-zinc-400 text-sm mb-1'
    msg.textContent = 'Intraday data requires live connection.'
    const sub = document.createElement('p')
    sub.className = 'text-zinc-600 text-xs'
    sub.textContent = 'Static pipeline provides daily bars. Use the Chart page for available timeframes.'
    notice.append(icon, msg, sub)
    container.appendChild(notice)
    el.textContent = ''
    el.appendChild(container)
    return
  }

  // Calculate VWAP if volume data exists
  const hasVolume = intraday[0] && (intraday[0].volume != null || intraday[0].v != null)
  let cumulativeVP = 0
  let cumulativeVol = 0

  // Build table
  const card = document.createElement('div')
  card.className = 'card p-3'
  const title = document.createElement('h3')
  title.className = 'text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2'
  title.textContent = `Intraday Bars \u2014 ${intraday.length} periods`
  card.appendChild(title)

  const tableWrap = document.createElement('div')
  tableWrap.className = 'overflow-x-auto max-h-[600px] overflow-y-auto'

  const table = document.createElement('table')
  table.className = 'w-full text-xs'

  // Header row
  const thead = document.createElement('thead')
  const headRow = document.createElement('tr')
  headRow.className = 'text-zinc-500 border-b border-zinc-800'
  const cols = ['Time', 'Open', 'High', 'Low', 'Close']
  if (hasVolume) cols.push('Volume', 'VWAP')
  for (const col of cols) {
    const th = document.createElement('th')
    th.className = 'py-1.5 px-2 text-right first:text-left font-medium'
    th.textContent = col
    headRow.appendChild(th)
  }
  thead.appendChild(headRow)

  // Body rows
  const tbody = document.createElement('tbody')
  for (const bar of intraday) {
    const time = bar.date || bar.time || bar.t || ''
    const open = bar.open ?? bar.o
    const high = bar.high ?? bar.h
    const low = bar.low ?? bar.l
    const close = bar.close ?? bar.c
    const vol = bar.volume ?? bar.v ?? 0
    const typical = (high + low + close) / 3

    // VWAP calculation
    let vwap = null
    if (hasVolume && vol > 0) {
      cumulativeVP += typical * vol
      cumulativeVol += vol
      vwap = cumulativeVP / cumulativeVol
    }

    const chg = close - open
    const tr = document.createElement('tr')
    tr.className = 'border-b border-zinc-800/50 hover:bg-zinc-800/30'

    const cells = [
      { text: formatBarTime(time), align: 'left', color: 'text-zinc-400' },
      { text: fmtPrice(open), color: 'text-zinc-300' },
      { text: fmtPrice(high), color: 'text-zinc-300' },
      { text: fmtPrice(low), color: 'text-zinc-300' },
      { text: fmtPrice(close), color: changeColor(chg) },
    ]

    if (hasVolume) {
      cells.push({ text: fmtCompact(vol), color: 'text-zinc-500' })
      cells.push({ text: vwap != null ? fmtPrice(vwap) : '\u2014', color: 'text-amber-400/80' })
    }

    for (const cell of cells) {
      const td = document.createElement('td')
      td.className = `py-1 px-2 font-mono ${cell.align === 'left' ? 'text-left' : 'text-right'} ${cell.color}`
      td.textContent = cell.text
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }

  table.append(thead, tbody)
  tableWrap.appendChild(table)
  card.appendChild(tableWrap)
  container.appendChild(card)

  el.textContent = ''
  el.appendChild(container)
}

function formatBarTime(time) {
  if (!time) return '\u2014'
  // Handle both ISO strings and unix timestamps
  const d = typeof time === 'number' ? new Date(time * 1000) : new Date(time)
  if (isNaN(d.getTime())) return String(time)
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'America/New_York',
  })
}
