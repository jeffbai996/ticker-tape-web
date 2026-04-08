// Short interest page: short data for a single symbol.

import { loadLookup, loadMeta, loadQuotes } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, fmtCompact, changeColor } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }

  symbol = symbol.toUpperCase()
  const [data, meta, quotes] = await Promise.all([
    loadLookup(symbol), loadMeta(), loadQuotes()
  ])

  if (!data) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = `No lookup data for ${symbol}.`
    el.appendChild(msg)
    return
  }

  const quote = quotes?.find(q => q.symbol === symbol)
  const name = meta?.names?.[symbol] || data.shortName || data.longName || ''

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
  for (const [page, label] of [['chart', 'Chart'], ['lookup', 'Lookup'], ['ratings', 'Ratings']]) {
    const btn = document.createElement('button')
    btn.className = 'px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors'
    btn.textContent = label
    btn.addEventListener('click', () => go(page, symbol))
    navRow.appendChild(btn)
  }

  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4'

  // Short interest card
  const shortPct = data.shortPercentOfFloat
  const shortRatio = data.shortRatio
  const sharesShort = data.sharesShort
  const sharesShortPrev = data.sharesShortPriorMonth

  const mainCard = buildCard('Short Interest', [
    ['Short % of Float', fmtPctVal(shortPct), shortHeatColor(shortPct)],
    ['Short Ratio (DTC)', shortRatio != null ? shortRatio.toFixed(2) + ' days' : '\u2014', dtcColor(shortRatio)],
    ['Shares Short', fmtCompact(sharesShort)],
    ['Short Prior Month', fmtCompact(sharesShortPrev)],
    ['Float Shares', fmtCompact(data.floatShares)],
    ['Shares Outstanding', fmtCompact(data.sharesOutstanding)],
  ])

  // Short context card
  const contextCard = document.createElement('div')
  contextCard.className = 'card p-3'
  const ctxTitle = document.createElement('h3')
  ctxTitle.className = 'text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3'
  ctxTitle.textContent = 'Short Analysis'
  contextCard.appendChild(ctxTitle)

  if (shortPct != null) {
    const pct = shortPct * 100

    // Big number display
    const bigNum = document.createElement('div')
    bigNum.className = 'text-center mb-4'
    const pctBig = document.createElement('span')
    pctBig.className = `font-mono text-3xl font-bold ${shortHeatColor(shortPct)}`
    pctBig.textContent = pct.toFixed(2) + '%'
    const pctSub = document.createElement('div')
    pctSub.className = 'text-xs text-zinc-500 mt-1'
    pctSub.textContent = 'of float sold short'
    bigNum.append(pctBig, pctSub)
    contextCard.appendChild(bigNum)

    // Short % gauge bar
    const bar = document.createElement('div')
    bar.className = 'h-2 bg-zinc-800 rounded-full overflow-hidden mb-1'
    const fill = document.createElement('div')
    // Color ramps from green (low short) to red (high short)
    fill.className = `h-full rounded-full ${pct > 20 ? 'bg-red-500' : pct > 10 ? 'bg-amber-500' : 'bg-green-500'}`
    fill.style.width = `${Math.min(100, pct * 2.5)}%` // 40% = full bar
    bar.appendChild(fill)
    const barLabels = document.createElement('div')
    barLabels.className = 'flex justify-between text-[10px] text-zinc-600'
    barLabels.innerHTML = '<span>0%</span><span>20%</span><span>40%+</span>'
    contextCard.append(bar, barLabels)

    // Month-over-month change
    if (sharesShort != null && sharesShortPrev != null && sharesShortPrev > 0) {
      const momChg = (sharesShort - sharesShortPrev) / sharesShortPrev
      const momDiv = document.createElement('div')
      momDiv.className = 'mt-4 pt-3 border-t border-zinc-800 flex justify-between'
      const momLabel = document.createElement('span')
      momLabel.className = 'text-xs text-zinc-500'
      momLabel.textContent = 'vs Prior Month'
      const momVal = document.createElement('span')
      momVal.className = `text-xs font-mono font-semibold ${momChg > 0 ? 'text-negative' : 'text-positive'}`
      momVal.textContent = (momChg > 0 ? '+' : '') + (momChg * 100).toFixed(1) + '%'
      momDiv.append(momLabel, momVal)
      contextCard.appendChild(momDiv)
    }

    // DTC context
    if (shortRatio != null) {
      const dtcDiv = document.createElement('div')
      dtcDiv.className = 'mt-3 pt-3 border-t border-zinc-800 flex justify-between'
      const dtcLabel = document.createElement('span')
      dtcLabel.className = 'text-xs text-zinc-500'
      dtcLabel.textContent = 'Days to Cover Risk'
      const dtcVal = document.createElement('span')
      dtcVal.className = `text-xs font-semibold ${shortRatio > 5 ? 'text-negative' : shortRatio > 3 ? 'text-amber-400' : 'text-positive'}`
      dtcVal.textContent = shortRatio > 5 ? 'High' : shortRatio > 3 ? 'Moderate' : 'Low'
      dtcDiv.append(dtcLabel, dtcVal)
      contextCard.appendChild(dtcDiv)
    }
  } else {
    const noData = document.createElement('p')
    noData.className = 'text-zinc-500 text-sm py-4 text-center'
    noData.textContent = 'Short interest data not available for this symbol.'
    contextCard.appendChild(noData)
  }

  grid.append(mainCard, contextCard)
  container.append(header, navRow, grid)
  el.textContent = ''
  el.appendChild(container)
}

function buildCard(title, rows) {
  const card = document.createElement('div')
  card.className = 'card p-3'
  const h = document.createElement('h3')
  h.className = 'text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2'
  h.textContent = title
  card.appendChild(h)

  for (const [label, value, colorClass] of rows) {
    const row = document.createElement('div')
    row.className = 'flex justify-between py-0.5 border-b border-zinc-800/50 last:border-0'
    const l = document.createElement('span')
    l.className = 'text-xs text-zinc-400'
    l.textContent = label
    const v = document.createElement('span')
    v.className = `text-xs font-mono ${colorClass || 'text-zinc-200'}`
    v.textContent = value || '\u2014'
    row.append(l, v)
    card.appendChild(row)
  }
  return card
}

function fmtPctVal(n) {
  if (n == null || isNaN(n)) return '\u2014'
  return (Number(n) * 100).toFixed(2) + '%'
}

function shortHeatColor(n) {
  if (n == null) return 'text-zinc-400'
  const pct = n * 100
  if (pct > 20) return 'text-negative'
  if (pct > 10) return 'text-amber-400'
  return 'text-positive'
}

function dtcColor(dtc) {
  if (dtc == null) return ''
  if (dtc > 5) return 'text-negative'
  if (dtc > 3) return 'text-amber-400'
  return 'text-zinc-200'
}
