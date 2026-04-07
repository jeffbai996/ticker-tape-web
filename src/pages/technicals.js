// Technicals page: SMA, RSI, MACD, Bollinger Bands, ATR, RS.

import { loadTechnicals, loadMeta, loadQuotes } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, changeColor, rsiColor, esc } from '../lib/format.js'
import { go } from '../router.js'

export async function render(el, symbol) {
  if (!symbol) {
    const quotes = await loadQuotes()
    if (quotes?.length) symbol = quotes[0].symbol
    else { el.textContent = 'No symbol specified.'; return }
  }

  symbol = symbol.toUpperCase()
  const [technicals, meta, quotes] = await Promise.all([
    loadTechnicals(), loadMeta(), loadQuotes()
  ])

  const ta = technicals?.[symbol]
  if (!ta) {
    el.textContent = ''
    const msg = document.createElement('div')
    msg.className = 'p-6 text-zinc-500'
    msg.textContent = `No technical data for ${symbol}.`
    el.appendChild(msg)
    return
  }

  const quote = quotes?.find(q => q.symbol === symbol)
  const name = meta?.names?.[symbol] || ''

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
  const chartBtn = document.createElement('button')
  chartBtn.className = 'ml-auto px-3 py-1 rounded text-xs bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors'
  chartBtn.textContent = 'View Chart'
  chartBtn.addEventListener('click', () => go('chart', symbol))
  header.append(symEl, nameEl, chartBtn)

  // Grid layout
  const grid = document.createElement('div')
  grid.className = 'grid grid-cols-1 lg:grid-cols-3 gap-4'

  // Moving Averages
  const smaCard = buildCard('Moving Averages', [
    row('Current', fmtPrice(ta.current), 'text-zinc-100 font-semibold'),
    row('SMA 20', fmtPrice(ta.sma_20), posColor(ta.current, ta.sma_20)),
    row('SMA 50', fmtPrice(ta.sma_50), posColor(ta.current, ta.sma_50)),
    row('SMA 200', fmtPrice(ta.sma_200), posColor(ta.current, ta.sma_200)),
  ])

  // Signals
  if (ta.trend_signals?.length) {
    const sigDiv = document.createElement('div')
    sigDiv.className = 'flex gap-1 flex-wrap mt-2'
    for (const sig of ta.trend_signals) {
      const badge = document.createElement('span')
      badge.className = `badge ${sigBg(sig)}`
      badge.textContent = sig
      sigDiv.appendChild(badge)
    }
    smaCard.appendChild(sigDiv)
  }

  // Momentum
  const momCard = buildCard('Momentum', [
    row('RSI (14)', Math.round(ta.rsi) + '', rsiColor(ta.rsi)),
    row('MACD', ta.macd?.toFixed(3) || '—'),
    row('Signal', ta.macd_signal?.toFixed(3) || '—'),
    row('Histogram', ta.macd_histogram?.toFixed(3) || '—', changeColor(ta.macd_histogram)),
    row('MACD Cross', ta.macd_crossover || 'none', ta.macd_crossover === 'bullish' ? 'text-positive' : ta.macd_crossover === 'bearish' ? 'text-negative' : ''),
  ])

  // RSI gauge visual
  const rsiGauge = document.createElement('div')
  rsiGauge.className = 'mt-3'
  const rsiBar = document.createElement('div')
  rsiBar.className = 'h-2 bg-zinc-800 rounded-full overflow-hidden relative'
  const rsiFill = document.createElement('div')
  rsiFill.className = `h-full rounded-full ${ta.rsi >= 70 ? 'bg-red-500' : ta.rsi <= 30 ? 'bg-green-500' : 'bg-amber-500'}`
  rsiFill.style.width = `${Math.min(100, Math.max(0, ta.rsi))}%`
  rsiBar.appendChild(rsiFill)
  const rsiLabels = document.createElement('div')
  rsiLabels.className = 'flex justify-between text-[10px] text-zinc-600 mt-0.5'
  rsiLabels.innerHTML = '<span>Oversold</span><span>Neutral</span><span>Overbought</span>'
  rsiGauge.append(rsiBar, rsiLabels)
  momCard.appendChild(rsiGauge)

  // Volatility
  const volCard = buildCard('Volatility & Range', [
    row('BB Upper', fmtPrice(ta.bb_upper)),
    row('BB Lower', fmtPrice(ta.bb_lower)),
    row('BB Width', ta.bb_width?.toFixed(2) + '%' || '—'),
    row('BB %B', ta.bb_pct_b?.toFixed(3) || '—'),
    row('ATR', fmtPrice(ta.atr)),
    row('ATR %', ta.atr_pct?.toFixed(2) + '%' || '—'),
    row('Vol Ratio', ta.vol_ratio?.toFixed(2) + 'x' || '—', volRatioColor(ta.vol_ratio)),
    row('Off 52w High', fmtPct(ta.off_high), 'text-negative'),
    row('Off 52w Low', fmtPct(ta.off_low), 'text-positive'),
    row('RS vs QQQ', fmtPct(ta.rs_vs_bench), changeColor(ta.rs_vs_bench)),
  ])

  grid.append(smaCard, momCard, volCard)
  container.append(header, grid)
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
  for (const r of rows) card.appendChild(r)
  return card
}

function row(label, value, colorClass = 'text-zinc-200') {
  const r = document.createElement('div')
  r.className = 'flex justify-between py-0.5 border-b border-zinc-800/50 last:border-0'
  const l = document.createElement('span')
  l.className = 'text-xs text-zinc-400'
  l.textContent = label
  const v = document.createElement('span')
  v.className = `text-xs font-mono ${colorClass}`
  v.textContent = value || '—'
  r.append(l, v)
  return r
}

function posColor(current, sma) {
  if (current == null || sma == null) return ''
  return current >= sma ? 'text-positive' : 'text-negative'
}

function sigBg(sig) {
  if (sig.includes('Golden')) return 'bg-green-500/15 text-green-400'
  if (sig.includes('Death')) return 'bg-red-500/15 text-red-400'
  if (sig.includes('Above')) return 'bg-green-500/10 text-green-400'
  if (sig.includes('Below')) return 'bg-red-500/10 text-red-400'
  return 'bg-zinc-800 text-zinc-400'
}

function volRatioColor(vr) {
  if (vr == null) return ''
  if (vr >= 1.5) return 'text-amber-400'
  if (vr <= 0.5) return 'text-zinc-500'
  return ''
}
