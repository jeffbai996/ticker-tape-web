// Chart page: candlestick chart using lightweight-charts (TradingView).

import { loadChart, loadMeta, loadQuotes } from '../lib/data.js'
import { fmtPrice, fmtPct, fmtChange, changeColor } from '../lib/format.js'
import { createChart } from 'lightweight-charts'

const TIMEFRAMES = ['1d', '5d', '1mo', '3mo', '1y', '5y']
const TF_LABELS = { '1d': '1D', '5d': '5D', '1mo': '1M', '3mo': '3M', '1y': '1Y', '5y': '5Y' }

export async function render(el, symbol) {
  if (!symbol) {
    // Show first symbol from quotes
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
  container.className = 'p-4 fade-in flex flex-col h-full'

  // Header: symbol + price + change
  const header = document.createElement('div')
  header.className = 'flex items-center gap-3 mb-3 flex-wrap'

  const symEl = document.createElement('span')
  symEl.className = 'font-mono text-xl font-bold text-amber-400'
  symEl.textContent = symbol

  const nameEl = document.createElement('span')
  nameEl.className = 'text-sm text-zinc-500'
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

  // Timeframe selector
  const tfBar = document.createElement('div')
  tfBar.className = 'flex gap-1 mb-3'

  let currentTF = '3mo'
  for (const tf of TIMEFRAMES) {
    const btn = document.createElement('button')
    btn.className = `px-3 py-1 rounded text-xs font-medium transition-colors ${tf === currentTF ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`
    btn.textContent = TF_LABELS[tf]
    btn.dataset.tf = tf
    btn.addEventListener('click', () => {
      currentTF = tf
      tfBar.querySelectorAll('button').forEach(b => {
        b.className = `px-3 py-1 rounded text-xs font-medium transition-colors ${b.dataset.tf === tf ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'}`
      })
      renderChart(chartEl, chartData, tf)
    })
    tfBar.appendChild(btn)
  }

  // Chart container
  const chartEl = document.createElement('div')
  chartEl.className = 'flex-1 min-h-[400px] rounded-lg overflow-hidden'

  container.append(header, tfBar, chartEl)
  el.textContent = ''
  el.appendChild(container)

  renderChart(chartEl, chartData, currentTF)
}

function renderChart(chartEl, data, timeframe) {
  chartEl.textContent = ''

  if (!data || !data[timeframe]) {
    chartEl.textContent = 'No chart data for this timeframe.'
    chartEl.className += ' flex items-center justify-center text-zinc-500'
    return
  }

  const ohlcv = data[timeframe]
  if (!ohlcv?.length) {
    chartEl.textContent = 'Empty chart data.'
    return
  }

  const chart = createChart(chartEl, {
    width: chartEl.clientWidth,
    height: chartEl.clientHeight || 400,
    layout: {
      background: { color: '#09090b' },
      textColor: '#a1a1aa',
      fontSize: 11,
      fontFamily: "'JetBrains Mono', monospace",
    },
    grid: {
      vertLines: { color: '#1e1e24' },
      horzLines: { color: '#1e1e24' },
    },
    crosshair: {
      mode: 0,
      vertLine: { color: '#f59e0b', width: 1, style: 2 },
      horzLine: { color: '#f59e0b', width: 1, style: 2 },
    },
    rightPriceScale: {
      borderColor: '#27272a',
    },
    timeScale: {
      borderColor: '#27272a',
      timeVisible: timeframe === '1d',
    },
  })

  // Candlestick series
  const candleSeries = chart.addCandlestickSeries({
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderDownColor: '#ef4444',
    borderUpColor: '#22c55e',
    wickDownColor: '#ef4444',
    wickUpColor: '#22c55e',
  })

  const candles = ohlcv.map(bar => ({
    time: bar.date || bar.time || bar.t,
    open: bar.open || bar.o,
    high: bar.high || bar.h,
    close: bar.close || bar.c,
    low: bar.low || bar.l,
  })).filter(c => c.time && !isNaN(c.open))

  if (candles.length) {
    candleSeries.setData(candles)
  }

  // Volume series
  if (ohlcv[0] && (ohlcv[0].volume != null || ohlcv[0].v != null)) {
    const volSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    const volumes = ohlcv.map(bar => ({
      time: bar.date || bar.time || bar.t,
      value: bar.volume || bar.v || 0,
      color: (bar.close || bar.c) >= (bar.open || bar.o) ? '#22c55e40' : '#ef444440',
    })).filter(v => v.time)

    if (volumes.length) {
      volSeries.setData(volumes)
    }
  }

  chart.timeScale().fitContent()

  // Resize observer
  const observer = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect
    chart.applyOptions({ width, height })
  })
  observer.observe(chartEl)
}
