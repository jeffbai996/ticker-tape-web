// Lookup page: single-stock fundamentals deep dive.

import { loadLookup, loadMeta, loadQuotes, loadTechnicals } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, fmtCap, fmtCompact, changeColor, rsiColor, esc } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }

  symbol = symbol.toUpperCase()
  const [data, meta, quotes, technicals] = await Promise.all([
    loadLookup(symbol), loadMeta(), loadQuotes(), loadTechnicals()
  ])

  if (!data) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = `No lookup data for ${symbol}. Data may not be fetched yet.`
    el.appendChild(msg)
    return
  }

  const quote = quotes?.find(q => q.symbol === symbol)
  const ta = technicals?.[symbol] || {}
  const name = meta?.names?.[symbol] || data.shortName || data.longName || ''

  const container = document.createElement('div')
  container.className = 'p-4 fade-in'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center gap-3 mb-4 flex-wrap'
  const symEl = document.createElement('span')
  symEl.className = 'font-mono text-xl font-bold text-amber-400'
  symEl.textContent = symbol
  const nameEl = document.createElement('span')
  nameEl.className = 'text-sm text-zinc-400'
  nameEl.textContent = name

  header.append(symEl, nameEl)

  if (quote) {
    const priceEl = document.createElement('span')
    priceEl.className = 'font-mono text-2xl font-extrabold text-zinc-100 ml-auto'
    priceEl.textContent = fmtPrice(quote.price)
    const chgEl = document.createElement('span')
    chgEl.className = `font-mono text-sm ${changeColor(quote.pct)}`
    chgEl.textContent = fmtChange(quote.change)
    const pctEl = document.createElement('span')
    pctEl.className = `font-mono text-sm font-semibold ${changeColor(quote.pct)}`
    pctEl.textContent = fmtPct(quote.pct)
    header.append(priceEl, chgEl, pctEl)

    // Extended hours block — matches TUI lookup display
    if (quote.ext_price != null && quote.ext_label) {
      const extRow = document.createElement('div')
      extRow.className = 'w-full flex items-center gap-2 mt-1'
      const extLabel = document.createElement('span')
      extLabel.className = 'text-xs font-semibold'
      extLabel.style.color = '#c864ff'
      extLabel.textContent = quote.ext_label
      const extPrice = document.createElement('span')
      extPrice.className = 'font-mono text-sm font-bold text-zinc-300'
      extPrice.textContent = fmtPrice(quote.ext_price)
      const extPct = document.createElement('span')
      extPct.className = `font-mono text-xs ${changeColor(quote.ext_pct)}`
      extPct.textContent = fmtPct(quote.ext_pct)
      extRow.append(extLabel, extPrice, extPct)
      header.appendChild(extRow)
    }
  }

  // Quick nav
  const navRow = document.createElement('div')
  navRow.className = 'flex gap-2 mb-4 flex-wrap'
  for (const [page, label] of [['chart', 'Chart'], ['technicals', 'Technicals'], ['dividends', 'Dividends'], ['ratings', 'Ratings'], ['short', 'Short'], ['news', 'News']]) {
    const btn = document.createElement('button')
    btn.className = 'px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors'
    btn.textContent = label
    btn.addEventListener('click', () => go(page, symbol))
    navRow.appendChild(btn)
  }

  // Two-column layout
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4'

  // LEFT: Valuation + Margins + Financials
  const left = document.createElement('div')
  left.className = 'space-y-4'

  left.appendChild(buildSection('Valuation', [
    ['Market Cap', fmtCap(data.marketCap)],
    ['P/E (TTM)', fmtVal(data.trailingPE)],
    ['P/E (Fwd)', fmtVal(data.forwardPE)],
    ['P/S', fmtVal(data.priceToSalesTrailing12Months)],
    ['P/B', fmtVal(data.priceToBook)],
    ['PEG', fmtVal(data.pegRatio)],
    ['EV/EBITDA', fmtVal(data.enterpriseToEbitda)],
    ['EV/Rev', fmtVal(data.enterpriseToRevenue)],
  ]))

  left.appendChild(buildSection('Margins', [
    ['Gross', fmtPctVal(data.grossMargins)],
    ['Operating', fmtPctVal(data.operatingMargins)],
    ['Net (Profit)', fmtPctVal(data.profitMargins)],
    ['EBITDA', fmtPctVal(data.ebitdaMargins)],
  ]))

  left.appendChild(buildSection('Financials', [
    ['Revenue', fmtCap(data.totalRevenue)],
    ['Revenue Growth', fmtPctVal(data.revenueGrowth)],
    ['Net Income', fmtCap(data.netIncomeToCommon)],
    ['Earnings Growth', fmtPctVal(data.earningsGrowth)],
    ['Free Cash Flow', fmtCap(data.freeCashflow)],
    ['Total Cash', fmtCap(data.totalCash)],
    ['Total Debt', fmtCap(data.totalDebt)],
    ['Debt/Equity', fmtVal(data.debtToEquity)],
  ]))

  // RIGHT: Technicals + Ownership + Info
  const right = document.createElement('div')
  right.className = 'space-y-4'

  right.appendChild(buildSection('Technicals', [
    ['RSI (14)', ta.rsi != null ? `${Math.round(ta.rsi)}` : '—', rsiColor(ta.rsi)],
    ['SMA 20', fmtPrice(ta.sma_20)],
    ['SMA 50', fmtPrice(ta.sma_50)],
    ['SMA 200', fmtPrice(ta.sma_200)],
    ['Off 52w High', ta.off_high != null ? fmtPct(ta.off_high) : '—'],
    ['Off 52w Low', ta.off_low != null ? fmtPct(ta.off_low) : '—'],
    ['Vol Ratio', ta.vol_ratio != null ? ta.vol_ratio.toFixed(2) + 'x' : '—'],
    ['ATR', ta.atr != null ? fmtPrice(ta.atr) : '—'],
    ['RS vs QQQ', ta.rs_vs_bench != null ? fmtPct(ta.rs_vs_bench) : '—'],
  ]))

  right.appendChild(buildSection('Ownership', [
    ['Insider %', fmtPctVal(data.heldPercentInsiders)],
    ['Institution %', fmtPctVal(data.heldPercentInstitutions)],
    ['Short %', fmtPctVal(data.shortPercentOfFloat)],
    ['Float', fmtCompact(data.floatShares)],
    ['Shares Out', fmtCompact(data.sharesOutstanding)],
  ]))

  right.appendChild(buildSection('Dividend', [
    ['Yield', fmtPctVal(data.dividendYield)],
    ['Rate', data.dividendRate != null ? '$' + fmtPrice(data.dividendRate) : '—'],
    ['Payout Ratio', fmtPctVal(data.payoutRatio)],
    ['Ex-Date', data.exDividendDate || '—'],
  ]))

  if (data.longBusinessSummary) {
    const descCard = document.createElement('div')
    descCard.className = 'card p-3'
    const descTitle = document.createElement('h3')
    descTitle.className = 'text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2'
    descTitle.textContent = 'About'
    const descText = document.createElement('p')
    descText.className = 'text-xs text-zinc-400 leading-relaxed line-clamp-6'
    descText.textContent = data.longBusinessSummary
    descCard.append(descTitle, descText)
    right.appendChild(descCard)
  }

  grid.append(left, right)
  container.append(header, navRow, grid)
  el.textContent = ''
  el.appendChild(container)
}

function buildSection(title, rows) {
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
    v.textContent = value || '—'
    row.append(l, v)
    card.appendChild(row)
  }

  return card
}

function fmtVal(n) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toFixed(2)
}

function fmtPctVal(n) {
  if (n == null || isNaN(n)) return '—'
  return (Number(n) * 100).toFixed(2) + '%'
}
