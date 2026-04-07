// Dashboard: thesis overview — card grid of all watched symbols.

import { loadQuotes, loadSparklines, loadTechnicals, loadEarnings, loadMeta } from '../lib/data.js'
import { fmtPrice, fmtChange, fmtPct, changeColor, rsiColor, sparklineSVG, esc, fmtCap } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el) {
  const [quotes, sparklines, technicals, earnings, meta] = await Promise.all([
    loadQuotes(), loadSparklines(), loadTechnicals(), loadEarnings(), loadMeta()
  ])

  if (!quotes?.length) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = 'No data available. Waiting for data pipeline...'
    el.appendChild(msg)
    return
  }

  const names = meta?.names || {}
  const earningsMap = {}
  if (earnings) {
    for (const e of earnings) earningsMap[e.symbol] = e
  }

  // Build page
  const container = document.createElement('div')
  container.className = 'p-4 fade-in'

  // Header
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between mb-4'
  const h1 = document.createElement('h1')
  h1.className = 'text-lg font-semibold text-zinc-100'
  h1.textContent = 'Dashboard'
  const ts = document.createElement('span')
  ts.className = 'text-xs text-zinc-500'
  ts.textContent = meta?.quotes_timestamp || ''
  header.append(h1, ts)

  // Portfolio summary bar (ported from TUI thesis screen)
  const summary = buildSummaryBar(quotes, technicals)
  if (summary) container.appendChild(summary)

  // Card grid
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3'

  for (const q of quotes) {
    const ta = technicals?.[q.symbol] || {}
    const earn = earningsMap[q.symbol]
    const spark = sparklines?.[q.symbol]
    const name = names[q.symbol] || ''
    const colorClass = changeColor(q.pct)

    const card = document.createElement('div')
    card.className = 'card card-clickable p-3 flex flex-col gap-2'
    card.addEventListener('click', () => go('lookup', q.symbol))

    // Row 1: Symbol + name
    const row1 = document.createElement('div')
    row1.className = 'flex items-center gap-2'
    const sym = document.createElement('span')
    sym.className = 'font-mono text-sm font-semibold text-accent'
    sym.textContent = q.symbol
    const nm = document.createElement('span')
    nm.className = 'text-xs text-zinc-500 truncate'
    nm.textContent = name
    row1.append(sym, nm)

    // Row 2: Price + change ($ unbold) + % (bold)
    const row2 = document.createElement('div')
    row2.className = 'flex items-baseline gap-2 flex-wrap'
    const price = document.createElement('span')
    price.className = 'font-mono text-xl font-extrabold text-zinc-100'
    price.textContent = fmtPrice(q.price)
    const changeDollar = document.createElement('span')
    changeDollar.className = `font-mono text-sm ${colorClass}`
    changeDollar.textContent = fmtChange(q.change)
    const changePct = document.createElement('span')
    changePct.className = `font-mono text-sm font-semibold ${colorClass}`
    changePct.textContent = fmtPct(q.pct)
    row2.append(price, changeDollar, changePct)

    // Row 3: Sparkline
    const row3 = document.createElement('div')
    row3.className = 'h-7 overflow-hidden'
    if (spark) {
      row3.innerHTML = sparklineSVG(spark, { width: 400, height: 28 })
    }

    // Row 4: Indicators
    const row4 = document.createElement('div')
    row4.className = 'flex items-center gap-2 flex-wrap'

    if (ta.rsi != null) {
      const rsiBadge = document.createElement('span')
      rsiBadge.className = `badge ${rsiColor(ta.rsi)} bg-zinc-800`
      rsiBadge.textContent = `RSI ${Math.round(ta.rsi)}`
      row4.appendChild(rsiBadge)
    }

    if (ta.trend_signals?.length) {
      for (const sig of ta.trend_signals.slice(0, 2)) {
        const sigBadge = document.createElement('span')
        sigBadge.className = 'badge bg-zinc-800 text-zinc-400'
        sigBadge.textContent = sig
        row4.appendChild(sigBadge)
      }
    }

    if (earn?.days_until != null) {
      const earnBadge = document.createElement('span')
      earnBadge.className = 'badge bg-amber-500/10 text-amber-400'
      earnBadge.textContent = `EPS ${earn.days_until}d`
      row4.appendChild(earnBadge)
    }

    // Row 5: Extended hours — purple label like TUI (#c864ff)
    if (q.ext_price && q.ext_label) {
      const row5 = document.createElement('div')
      row5.className = 'flex items-center gap-2 text-xs'
      const extLabel = document.createElement('span')
      extLabel.className = 'font-semibold'
      extLabel.style.color = '#c864ff'
      extLabel.textContent = q.ext_label
      const extPrice = document.createElement('span')
      extPrice.className = 'font-mono font-bold text-zinc-400'
      extPrice.textContent = fmtPrice(q.ext_price)
      const extChange = document.createElement('span')
      extChange.className = `font-mono ${changeColor(q.ext_pct)}`
      extChange.textContent = fmtPct(q.ext_pct)
      row5.append(extLabel, extPrice, extChange)
      card.append(row1, row2, row3, row4, row5)
    } else {
      card.append(row1, row2, row3, row4)
    }

    grid.appendChild(card)
  }

  container.append(header, grid)
  el.textContent = ''
  el.appendChild(container)
}

function buildSummaryBar(quotes, technicals) {
  if (!quotes?.length) return null

  const pcts = quotes.map(q => q.pct).filter(p => p != null)
  const adv = pcts.filter(p => p > 0).length
  const dec = pcts.filter(p => p < 0).length
  const avg = pcts.length ? (pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0

  // SMA breadth from technicals
  let above50 = 0, below50 = 0, above200 = 0, below200 = 0
  let oversold = 0, overbought = 0
  const offHighs = []

  if (technicals) {
    for (const sym of Object.keys(technicals)) {
      const ta = technicals[sym]
      if (ta.current && ta.sma_50) {
        if (ta.current >= ta.sma_50) above50++; else below50++
      }
      if (ta.current && ta.sma_200) {
        if (ta.current >= ta.sma_200) above200++; else below200++
      }
      if (ta.rsi != null) {
        if (ta.rsi <= 30) oversold++
        if (ta.rsi >= 70) overbought++
      }
      if (ta.off_high != null) offHighs.push(ta.off_high)
    }
  }

  const avgOffHigh = offHighs.length ? (offHighs.reduce((a, b) => a + b, 0) / offHighs.length) : null

  const bar = document.createElement('div')
  bar.className = 'card p-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs'

  const items = [
    { label: `${quotes.length} symbols`, cls: 'text-zinc-400' },
    { label: `Avg ${fmtPct(avg)}`, cls: changeColor(avg) },
    { label: `▲${adv}`, cls: 'text-positive' },
    { label: `▼${dec}`, cls: 'text-negative' },
  ]

  if (above50 + below50 > 0) {
    items.push({ label: `SMA50: ▲${above50} ▼${below50}`, cls: 'text-zinc-400' })
  }
  if (above200 + below200 > 0) {
    items.push({ label: `SMA200: ▲${above200} ▼${below200}`, cls: 'text-zinc-400' })
  }
  if (oversold > 0) {
    items.push({ label: `${oversold} oversold`, cls: 'text-positive' })
  }
  if (overbought > 0) {
    items.push({ label: `${overbought} overbought`, cls: 'text-negative' })
  }
  if (avgOffHigh != null) {
    items.push({ label: `${avgOffHigh.toFixed(1)}% off highs`, cls: 'text-zinc-500' })
  }

  for (const item of items) {
    const span = document.createElement('span')
    span.className = `font-mono ${item.cls}`
    span.textContent = item.label
    bar.appendChild(span)
  }

  return bar
}
