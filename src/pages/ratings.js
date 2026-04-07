// Ratings page: analyst ratings and price targets for a single symbol.

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
  const currentPrice = quote?.price ?? data.currentPrice ?? data.previousClose

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
    priceEl.className = 'font-mono text-xl font-semibold text-zinc-100 ml-auto'
    priceEl.textContent = fmtPrice(quote.price)
    const chgEl = document.createElement('span')
    chgEl.className = `font-mono text-sm ${changeColor(quote.pct)}`
    chgEl.textContent = `${fmtChange(quote.change)}  ${fmtPct(quote.pct)}`
    header.append(priceEl, chgEl)
  }

  // Nav buttons
  const navRow = document.createElement('div')
  navRow.className = 'flex gap-2 mb-4 flex-wrap'
  for (const [page, label] of [['chart', 'Chart'], ['lookup', 'Lookup'], ['dividends', 'Dividends']]) {
    const btn = document.createElement('button')
    btn.className = 'px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors'
    btn.textContent = label
    btn.addEventListener('click', () => go(page, symbol))
    navRow.appendChild(btn)
  }

  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 lg:grid-cols-2 gap-4'

  // Recommendation badge card
  const recCard = document.createElement('div')
  recCard.className = 'card p-4'

  const recKey = data.recommendationKey || ''
  const recLabel = formatRec(recKey)
  const numAnalysts = data.numberOfAnalystOpinions
  const targetMean = data.targetMeanPrice
  const targetHigh = data.targetHighPrice
  const targetLow = data.targetLowPrice
  const targetMedian = data.targetMedianPrice

  // Big recommendation badge
  const badgeWrap = document.createElement('div')
  badgeWrap.className = 'text-center mb-4'
  const badge = document.createElement('span')
  badge.className = `inline-block px-4 py-2 rounded-lg text-lg font-bold ${recBadgeColor(recKey)}`
  badge.textContent = recLabel
  const analystCount = document.createElement('div')
  analystCount.className = 'text-xs text-zinc-500 mt-2'
  analystCount.textContent = numAnalysts != null ? `Based on ${numAnalysts} analyst${numAnalysts !== 1 ? 's' : ''}` : 'No analyst count available'
  badgeWrap.append(badge, analystCount)
  recCard.appendChild(badgeWrap)

  // Price targets summary
  if (targetMean != null || targetHigh != null || targetLow != null) {
    const targetsDiv = document.createElement('div')
    targetsDiv.className = 'space-y-1 pt-3 border-t border-zinc-800'

    const targets = [
      ['Target Low', targetLow],
      ['Target Median', targetMedian],
      ['Target Mean', targetMean],
      ['Target High', targetHigh],
    ]

    for (const [label, val] of targets) {
      if (val == null) continue
      const row = document.createElement('div')
      row.className = 'flex justify-between py-0.5'
      const l = document.createElement('span')
      l.className = 'text-xs text-zinc-400'
      l.textContent = label
      const v = document.createElement('span')
      const upside = currentPrice ? ((val - currentPrice) / currentPrice) : null
      v.className = `text-xs font-mono ${upside != null ? (upside >= 0 ? 'text-positive' : 'text-negative') : 'text-zinc-200'}`
      v.textContent = '$' + fmtPrice(val)
      if (upside != null) {
        v.textContent += ` (${upside >= 0 ? '+' : ''}${(upside * 100).toFixed(1)}%)`
      }
      row.append(l, v)
      targetsDiv.appendChild(row)
    }
    recCard.appendChild(targetsDiv)
  }

  // Price target range gauge card
  const gaugeCard = document.createElement('div')
  gaugeCard.className = 'card p-4'
  const gaugeTitle = document.createElement('h3')
  gaugeTitle.className = 'text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-4'
  gaugeTitle.textContent = 'Price Target Range'
  gaugeCard.appendChild(gaugeTitle)

  if (targetLow != null && targetHigh != null && currentPrice != null) {
    const range = targetHigh - targetLow
    const currentPos = range > 0 ? ((currentPrice - targetLow) / range) * 100 : 50
    const meanPos = range > 0 && targetMean != null ? ((targetMean - targetLow) / range) * 100 : null

    // Range bar
    const gaugeWrap = document.createElement('div')
    gaugeWrap.className = 'relative pt-6 pb-4'

    const rangeBar = document.createElement('div')
    rangeBar.className = 'h-3 bg-zinc-800 rounded-full relative overflow-visible'

    // Fill from low to high
    const rangeFill = document.createElement('div')
    rangeFill.className = 'h-full rounded-full bg-gradient-to-r from-red-500/30 via-amber-500/30 to-green-500/30'
    rangeFill.style.width = '100%'
    rangeBar.appendChild(rangeFill)

    // Current price marker
    const marker = document.createElement('div')
    marker.className = 'absolute top-0 w-0.5 h-5 bg-zinc-100 -translate-x-1/2'
    marker.style.left = `${Math.min(100, Math.max(0, currentPos))}%`
    marker.style.top = '-4px'
    rangeBar.appendChild(marker)

    // Current price label
    const markerLabel = document.createElement('div')
    markerLabel.className = 'absolute text-[10px] font-mono text-zinc-100 -translate-x-1/2 whitespace-nowrap'
    markerLabel.style.left = `${Math.min(100, Math.max(0, currentPos))}%`
    markerLabel.style.top = '-18px'
    markerLabel.textContent = `Current $${fmtPrice(currentPrice)}`
    gaugeWrap.appendChild(markerLabel)

    // Mean target marker
    if (meanPos != null) {
      const meanMarker = document.createElement('div')
      meanMarker.className = 'absolute top-0 w-0.5 h-3 bg-amber-400 -translate-x-1/2'
      meanMarker.style.left = `${Math.min(100, Math.max(0, meanPos))}%`
      rangeBar.appendChild(meanMarker)
    }

    gaugeWrap.appendChild(rangeBar)

    // Low/High labels
    const labels = document.createElement('div')
    labels.className = 'flex justify-between mt-1'
    const lowLabel = document.createElement('span')
    lowLabel.className = 'text-[10px] font-mono text-red-400'
    lowLabel.textContent = `$${fmtPrice(targetLow)}`
    const highLabel = document.createElement('span')
    highLabel.className = 'text-[10px] font-mono text-green-400'
    highLabel.textContent = `$${fmtPrice(targetHigh)}`
    labels.append(lowLabel, highLabel)
    gaugeWrap.appendChild(labels)

    gaugeCard.appendChild(gaugeWrap)

    // Upside/downside from mean
    if (targetMean != null) {
      const upsideDiv = document.createElement('div')
      upsideDiv.className = 'mt-3 pt-3 border-t border-zinc-800 text-center'
      const upside = ((targetMean - currentPrice) / currentPrice) * 100
      const upsideLabel = document.createElement('span')
      upsideLabel.className = 'text-xs text-zinc-500'
      upsideLabel.textContent = 'Mean Target Upside: '
      const upsideVal = document.createElement('span')
      upsideVal.className = `text-sm font-mono font-bold ${upside >= 0 ? 'text-positive' : 'text-negative'}`
      upsideVal.textContent = `${upside >= 0 ? '+' : ''}${upside.toFixed(1)}%`
      upsideDiv.append(upsideLabel, upsideVal)
      gaugeCard.appendChild(upsideDiv)
    }

    // Legend
    const legend = document.createElement('div')
    legend.className = 'flex gap-4 justify-center mt-3 text-[10px] text-zinc-600'
    legend.innerHTML = '<span>\u2503 Current</span><span class="text-amber-400">\u2503 Mean Target</span>'
    gaugeCard.appendChild(legend)
  } else {
    const noGauge = document.createElement('p')
    noGauge.className = 'text-zinc-500 text-sm py-4 text-center'
    noGauge.textContent = 'Insufficient data to render price target range.'
    gaugeCard.appendChild(noGauge)
  }

  grid.append(recCard, gaugeCard)
  container.append(header, navRow, grid)
  el.textContent = ''
  el.appendChild(container)
}

function formatRec(key) {
  const map = {
    'strong_buy': 'Strong Buy',
    'buy': 'Buy',
    'hold': 'Hold',
    'underperform': 'Underperform',
    'sell': 'Sell',
  }
  return map[key] || key || 'N/A'
}

function recBadgeColor(key) {
  const map = {
    'strong_buy': 'bg-green-500/20 text-green-400',
    'buy': 'bg-green-500/15 text-green-400',
    'hold': 'bg-amber-500/15 text-amber-400',
    'underperform': 'bg-red-500/15 text-red-400',
    'sell': 'bg-red-500/20 text-red-400',
  }
  return map[key] || 'bg-zinc-800 text-zinc-400'
}
