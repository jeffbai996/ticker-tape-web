// Dividends page: dividend info for a single symbol.

import { loadLookup, loadMeta, loadQuotes } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, changeColor } from '../lib/format.js'
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

  // Dividend info card
  const hasDividend = data.dividendYield != null || data.dividendRate != null
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4'

  // Main dividend card
  const mainCard = buildCard('Dividend Summary', [
    ['Dividend Yield', fmtPctVal(data.dividendYield), yieldColor(data.dividendYield)],
    ['Annual Rate', data.dividendRate != null ? '$' + fmtPrice(data.dividendRate) : '\u2014'],
    ['Payout Ratio', fmtPctVal(data.payoutRatio), payoutColor(data.payoutRatio)],
    ['Ex-Dividend Date', formatExDate(data.exDividendDate)],
    ['5Y Avg Yield', fmtPctVal(data.fiveYearAvgDividendYield ? data.fiveYearAvgDividendYield / 100 : null)],
  ])

  // Yield context card
  const contextCard = document.createElement('div')
  contextCard.className = 'card p-3'
  const ctxTitle = document.createElement('h3')
  ctxTitle.className = 'text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3'
  ctxTitle.textContent = 'Yield Analysis'
  contextCard.appendChild(ctxTitle)

  if (hasDividend && data.dividendYield != null && quote?.price) {
    const yieldPct = data.dividendYield * 100
    const annualRate = data.dividendRate || 0

    // Yield gauge
    const gaugeLabel = document.createElement('div')
    gaugeLabel.className = 'text-center mb-3'
    const yieldBig = document.createElement('span')
    yieldBig.className = 'font-mono text-3xl font-bold text-amber-400'
    yieldBig.textContent = yieldPct.toFixed(2) + '%'
    const yieldSub = document.createElement('div')
    yieldSub.className = 'text-xs text-zinc-500 mt-1'
    yieldSub.textContent = `$${fmtPrice(annualRate)} per share annually`
    gaugeLabel.append(yieldBig, yieldSub)
    contextCard.appendChild(gaugeLabel)

    // Yield bar
    const bar = document.createElement('div')
    bar.className = 'h-2 bg-zinc-800 rounded-full overflow-hidden mb-1'
    const fill = document.createElement('div')
    fill.className = 'h-full rounded-full bg-amber-500'
    fill.style.width = `${Math.min(100, yieldPct * 10)}%` // 10% yield = full bar
    bar.appendChild(fill)
    const barLabels = document.createElement('div')
    barLabels.className = 'flex justify-between text-[10px] text-zinc-600'
    barLabels.innerHTML = '<span>0%</span><span>5%</span><span>10%+</span>'
    contextCard.append(bar, barLabels)

    // Payout sustainability
    if (data.payoutRatio != null) {
      const sustDiv = document.createElement('div')
      sustDiv.className = 'mt-4 pt-3 border-t border-zinc-800'
      const sustLabel = document.createElement('span')
      sustLabel.className = 'text-xs text-zinc-500'
      sustLabel.textContent = 'Payout Sustainability: '
      const sustVal = document.createElement('span')
      const payout = data.payoutRatio * 100
      sustVal.className = `text-xs font-semibold ${payout < 60 ? 'text-positive' : payout < 80 ? 'text-amber-400' : 'text-negative'}`
      sustVal.textContent = payout < 60 ? 'Healthy' : payout < 80 ? 'Moderate' : 'Stretched'
      sustDiv.append(sustLabel, sustVal)
      contextCard.appendChild(sustDiv)
    }
  } else {
    const noDiv = document.createElement('p')
    noDiv.className = 'text-zinc-500 text-sm py-4 text-center'
    noDiv.textContent = hasDividend ? 'Limited dividend data available.' : 'This stock does not pay a dividend.'
    contextCard.appendChild(noDiv)
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

function yieldColor(y) {
  if (y == null) return ''
  const pct = y * 100
  if (pct >= 4) return 'text-amber-400'
  if (pct >= 2) return 'text-positive'
  return 'text-zinc-200'
}

function payoutColor(p) {
  if (p == null) return ''
  const pct = p * 100
  if (pct > 80) return 'text-negative'
  if (pct > 60) return 'text-amber-400'
  return 'text-positive'
}

function formatExDate(d) {
  if (!d) return '\u2014'
  // Handle unix timestamp or date string
  const date = typeof d === 'number' ? new Date(d * 1000) : new Date(d)
  if (isNaN(date.getTime())) return String(d)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
