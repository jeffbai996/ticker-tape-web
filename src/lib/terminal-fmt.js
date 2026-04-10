// Terminal text formatters.
// Return arrays of lines. Each line is either:
//   { text, color }              — single-color line (legacy, still supported)
//   [{ text, color }, ...]       — rich line with inline colored segments
// Colors: #ffc800 accent, #00c8ff info, #2ecc71 positive, #ff3232 negative,
//         #c864ff extended hours, #e0e0e0 default, #888 dimmed, white prices.

import { fmtPrice, fmtPct, fmtChange, fmtCap, fmtCompact, timeAgo } from './format.js'

// ── Helpers ──────────────────────────────────────────
const C = {
  accent:   '#ffc800',
  info:     '#00c8ff',
  pos:      '#2ecc71',
  neg:      '#ff3232',
  ext:      '#c864ff',
  text:     '#e0e0e0',
  dim:      '#888',
  white:    'white',
}

function line(text, color = C.text) { return { text, color } }
function seg(text, color = C.text) { return { text, color } }
function rich(...segments) { return segments }
function blank() { return line('') }
function divider(label) {
  const pad = label ? ` ${label} ` : ''
  const dashes = '─'.repeat(Math.max(2, 40 - pad.length))
  return line(`──${pad}${dashes}`, C.dim)
}
function changeColor(n) { return n > 0 ? C.pos : n < 0 ? C.neg : C.text }
function pad(s, len) { return String(s).padEnd(len) }
function rpad(s, len) { return String(s).padStart(len) }

function unicodeSparkline(prices) {
  if (!prices?.length) return ''
  const bars = '▁▂▃▄▅▆▇█'
  const sampled = prices.length > 20
    ? Array.from({ length: 20 }, (_, i) => prices[Math.floor(i * prices.length / 20)])
    : prices
  const min = Math.min(...sampled)
  const max = Math.max(...sampled)
  const range = max - min || 1
  return sampled.map(p => bars[Math.min(7, Math.round(((p - min) / range) * 7))]).join('')
}

// ── Thesis Overview ──────────────────────────────────
export function fmtThesis(quotes, technicals, earnings, sparklines) {
  const lines = []
  if (!quotes?.length) { lines.push(line('No quote data available.', C.dim)); return lines }

  // Summary header
  const up = quotes.filter(q => q.pct > 0).length
  const down = quotes.filter(q => q.pct < 0).length
  const avg = quotes.reduce((s, q) => s + (q.pct || 0), 0) / quotes.length
  lines.push(rich(
    seg(`${quotes.length} symbols`, C.accent),
    seg('  |  ', C.dim),
    seg(`Avg ${fmtPct(avg)}`, changeColor(avg)),
    seg('  |  ', C.dim),
    seg(`▲${up}`, C.pos),
    seg(` ▼${down}`, C.neg),
  ))
  lines.push(blank())

  for (const q of quotes) {
    const sym = q.symbol
    const ta = technicals?.[sym]
    const er = earnings?.find(e => e.symbol === sym)
    const cc = changeColor(q.pct)

    // Line 1: SYMBOL  NAME
    lines.push(rich(
      seg(pad(sym, 6), C.accent),
      seg(q.name || sym, C.dim),
    ))

    // Line 2: price  change  pct  |  RSI  signals
    const segs = [
      seg(`  ${fmtPrice(q.price)}`, C.white),
      seg(`  ${fmtChange(q.change)}`, cc),
      seg(`  ${fmtPct(q.pct)}`, cc),
    ]
    if (ta?.rsi != null) {
      const rsi = Math.round(ta.rsi)
      const rc = rsi >= 70 ? C.neg : rsi <= 30 ? C.pos : C.dim
      segs.push(seg('    RSI ', C.dim), seg(String(rsi), rc))
    }
    if (ta?.trend_signals?.length) {
      segs.push(seg('  ' + ta.trend_signals.join('  '), C.info))
    }
    lines.push(rich(...segs))

    // Line 3: sparkline
    const spark = sparklines?.[sym]
    if (spark?.length) {
      lines.push(rich(seg('  ', C.dim), seg(unicodeSparkline(spark), cc)))
    }

    // Line 4: extended hours + earnings
    const extSegs = []
    if (q.ext_price != null) {
      extSegs.push(
        seg(`  ${q.ext_label || 'AH'} `, C.ext),
        seg(fmtPrice(q.ext_price), C.ext),
        seg(`  ${fmtPct(q.ext_pct)}`, C.ext),
      )
    }
    if (er) {
      extSegs.push(seg(`    EPS ${er.days_until}d`, C.info))
    }
    if (extSegs.length) lines.push(rich(...extSegs))

    lines.push(blank())
  }
  return lines
}

// ── Market Overview ──────────────────────────────────
export function fmtMarket(market) {
  const lines = []
  if (!market) { lines.push(line('No market data available.', C.dim)); return lines }

  for (const [category, items] of Object.entries(market)) {
    lines.push(line(category, C.info))
    for (const item of items) {
      lines.push(rich(
        seg(`  ${pad(item.name || item.symbol, 18)}`, C.dim),
        seg(rpad(fmtPrice(item.price, item.price < 10 ? 4 : 2), 12), C.white),
        seg(fmtPct(item.pct), changeColor(item.pct)),
      ))
    }
    lines.push(blank())
  }
  return lines
}

// ── Technicals ───────────────────────────────────────
function kv(label, value, valueColor = C.text) {
  return rich(seg(`  ${pad(label, 14)}`, C.dim), seg(value, valueColor))
}

export function fmtTechnicals(ta, symbol) {
  const lines = []
  if (!ta) { lines.push(line(`No technicals for ${symbol}.`, C.dim)); return lines }

  lines.push(line(`${symbol} Technical Analysis`, C.accent))
  lines.push(blank())

  // Moving Averages
  lines.push(divider('Moving Averages'))
  lines.push(kv('Current', fmtPrice(ta.current), C.white))
  const smas = [
    { label: 'SMA 20', val: ta.sma_20 },
    { label: 'SMA 50', val: ta.sma_50 },
    { label: 'SMA 200', val: ta.sma_200 },
  ]
  for (const sma of smas) {
    if (sma.val == null) continue
    const diff = ((ta.current - sma.val) / sma.val) * 100
    const rel = diff >= 0 ? 'above' : 'below'
    lines.push(rich(
      seg(`  ${pad(sma.label, 14)}`, C.dim),
      seg(fmtPrice(sma.val), changeColor(diff)),
      seg(`  ${fmtPct(diff)} ${rel}`, changeColor(diff)),
    ))
  }
  lines.push(blank())

  // Momentum
  lines.push(divider('Momentum'))
  const rsi = ta.rsi != null ? Math.round(ta.rsi) : null
  const rsiLbl = rsi == null ? '' : rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral'
  const rc = rsi == null ? C.dim : rsi >= 70 ? C.neg : rsi <= 30 ? C.pos : C.text
  if (rsi != null) lines.push(rich(seg('  RSI (14)    ', C.dim), seg(String(rsi), rc), seg(`  ${rsiLbl}`, rc)))
  if (ta.macd != null) lines.push(kv('MACD', ta.macd.toFixed(3)))
  if (ta.macd_signal != null) lines.push(kv('Signal', ta.macd_signal.toFixed(3)))
  if (ta.macd_histogram != null) {
    const h = ta.macd_histogram
    lines.push(kv('Histogram', `${h > 0 ? '+' : ''}${h.toFixed(3)}`, changeColor(h)))
  }
  if (ta.macd_crossover) lines.push(kv('Crossover', ta.macd_crossover, C.info))
  lines.push(blank())

  // Volatility
  lines.push(divider('Volatility'))
  if (ta.bb_upper != null) lines.push(kv('BB Upper', fmtPrice(ta.bb_upper)))
  if (ta.bb_lower != null) lines.push(kv('BB Lower', fmtPrice(ta.bb_lower)))
  if (ta.atr != null) {
    const atrPct = ta.atr_pct != null ? `  (${ta.atr_pct.toFixed(2)}%)` : ''
    lines.push(kv('ATR', `${ta.atr.toFixed(2)}${atrPct}`))
  }
  if (ta.vol_ratio != null) lines.push(kv('Vol Ratio', `${ta.vol_ratio.toFixed(2)}x`))
  lines.push(blank())

  // Range
  lines.push(divider('Range'))
  if (ta.high_52w != null) lines.push(rich(
    seg('  52w High    ', C.dim),
    seg(fmtPrice(ta.high_52w), C.neg),
    seg(`  ${fmtPct(ta.off_high)} off`, C.neg),
  ))
  if (ta.low_52w != null) lines.push(rich(
    seg('  52w Low     ', C.dim),
    seg(fmtPrice(ta.low_52w), C.pos),
    seg(`  ${fmtPct(ta.off_low)} off`, C.pos),
  ))
  if (ta.rs_vs_bench != null) lines.push(kv('RS vs QQQ', fmtPct(ta.rs_vs_bench), changeColor(ta.rs_vs_bench)))

  // Signals
  if (ta.trend_signals?.length) {
    lines.push(blank())
    lines.push(line(`  Signals: ${ta.trend_signals.join(' | ')}`, C.info))
  }

  return lines
}

// ── Lookup / Fundamentals ────────────────────────────
export function fmtLookup(data, symbol, name) {
  const lines = []
  if (!data) { lines.push(line(`No data for ${symbol}.`, C.dim)); return lines }

  const n = data.longName || data.shortName || name || symbol
  lines.push(rich(seg(symbol, C.accent), seg('  ' + n, C.dim)))
  lines.push(line(`${data.sector || ''} | ${data.industry || ''}`, C.info))
  lines.push(blank())

  // Price info
  lines.push(divider('Price'))
  lines.push(kv('Price', fmtPrice(data.currentPrice || data.regularMarketPrice), C.white))
  if (data.regularMarketChange != null) {
    const cc = changeColor(data.regularMarketChange)
    lines.push(rich(
      seg('  Change        ', C.dim),
      seg(fmtChange(data.regularMarketChange), cc),
      seg(`  ${fmtPct(data.regularMarketChangePercent)}`, cc),
    ))
  }
  if (data.postMarketPrice != null) {
    lines.push(rich(
      seg('  After Hours   ', C.dim),
      seg(fmtPrice(data.postMarketPrice), C.ext),
      seg(`  ${fmtPct(data.postMarketChangePercent)}`, C.ext),
    ))
  }
  lines.push(blank())

  // Valuation
  lines.push(divider('Valuation'))
  if (data.marketCap != null) lines.push(kv('Market Cap', fmtCap(data.marketCap)))
  if (data.trailingPE != null) lines.push(kv('P/E (TTM)', data.trailingPE.toFixed(2)))
  if (data.forwardPE != null) lines.push(kv('P/E (Fwd)', data.forwardPE.toFixed(2)))
  if (data.priceToSalesTrailing12Months != null) lines.push(kv('P/S', data.priceToSalesTrailing12Months.toFixed(2)))
  if (data.priceToBook != null) lines.push(kv('P/B', data.priceToBook.toFixed(2)))
  if (data.trailingPegRatio != null) lines.push(kv('PEG', data.trailingPegRatio.toFixed(2)))
  if (data.enterpriseToRevenue != null) lines.push(kv('EV/Revenue', data.enterpriseToRevenue.toFixed(2)))
  if (data.enterpriseToEbitda != null) lines.push(kv('EV/EBITDA', data.enterpriseToEbitda.toFixed(2)))
  lines.push(blank())

  // Financials
  lines.push(divider('Financials'))
  if (data.totalRevenue != null) lines.push(kv('Revenue', fmtCap(data.totalRevenue)))
  if (data.grossMargins != null) lines.push(kv('Gross Margin', `${(data.grossMargins * 100).toFixed(1)}%`))
  if (data.operatingMargins != null) lines.push(kv('Op Margin', `${(data.operatingMargins * 100).toFixed(1)}%`))
  if (data.profitMargins != null) lines.push(kv('Net Margin', `${(data.profitMargins * 100).toFixed(1)}%`))
  if (data.returnOnEquity != null) lines.push(kv('ROE', `${(data.returnOnEquity * 100).toFixed(1)}%`))
  if (data.revenueGrowth != null) lines.push(kv('Rev Growth', fmtPct(data.revenueGrowth * 100), changeColor(data.revenueGrowth)))
  if (data.earningsGrowth != null) lines.push(kv('EPS Growth', fmtPct(data.earningsGrowth * 100), changeColor(data.earningsGrowth)))
  lines.push(blank())

  // Balance Sheet
  lines.push(divider('Balance Sheet'))
  if (data.totalCash != null) lines.push(kv('Cash', fmtCap(data.totalCash)))
  if (data.totalDebt != null) lines.push(kv('Debt', fmtCap(data.totalDebt)))
  if (data.debtToEquity != null) lines.push(kv('D/E', data.debtToEquity.toFixed(2)))
  if (data.currentRatio != null) lines.push(kv('Current Ratio', data.currentRatio.toFixed(2)))
  if (data.quickRatio != null) lines.push(kv('Quick Ratio', data.quickRatio.toFixed(2)))
  lines.push(blank())

  // Shares & Short
  lines.push(divider('Shares'))
  if (data.sharesOutstanding != null) lines.push(kv('Shares Out', fmtCompact(data.sharesOutstanding)))
  if (data.floatShares != null) lines.push(kv('Float', fmtCompact(data.floatShares)))
  if (data.shortPercentOfFloat != null) lines.push(kv('Short % Float', `${(data.shortPercentOfFloat * 100).toFixed(2)}%`))
  if (data.heldPercentInsiders != null) lines.push(kv('Insider %', `${(data.heldPercentInsiders * 100).toFixed(1)}%`))
  if (data.heldPercentInstitutions != null) lines.push(kv('Inst %', `${(data.heldPercentInstitutions * 100).toFixed(1)}%`))
  lines.push(blank())

  // Analyst
  lines.push(divider('Analyst'))
  if (data.recommendationKey) lines.push(kv('Rating', data.recommendationKey.replace('_', ' ').toUpperCase(), C.info))
  if (data.numberOfAnalystOpinions) lines.push(kv('Analysts', String(data.numberOfAnalystOpinions)))
  if (data.targetMeanPrice != null) lines.push(kv('Target (mean)', fmtPrice(data.targetMeanPrice)))
  if (data.targetHighPrice != null && data.targetLowPrice != null) {
    lines.push(rich(
      seg('  Range         ', C.dim),
      seg(`${fmtPrice(data.targetLowPrice)} — ${fmtPrice(data.targetHighPrice)}`, C.text),
    ))
  }

  return lines
}

// ── News Headlines ───────────────────────────────────
export function fmtNews(news, symbol) {
  const lines = []
  if (!news) { lines.push(line('No news available.', C.dim)); return lines }

  // news can be { SYM: [...] } or just [...]
  const items = Array.isArray(news)
    ? news
    : symbol
      ? (news[symbol] || [])
      : Object.values(news).flat()

  if (!items.length) { lines.push(line(`No news for ${symbol || 'watchlist'}.`, C.dim)); return lines }

  lines.push(line(`News${symbol ? ` — ${symbol}` : ''}`, C.accent))
  lines.push(blank())

  const shown = items.slice(0, 15)
  for (const item of shown) {
    lines.push(line(`  ${item.title}`, C.text))
    lines.push(line(`  ${item.publisher || ''}  ${item.age || ''}`, C.dim))
    lines.push(blank())
  }
  return lines
}

// ── Earnings Calendar ────────────────────────────────
export function fmtEarnings(earnings) {
  const lines = []
  if (!earnings?.length) { lines.push(line('No earnings data.', C.dim)); return lines }

  lines.push(line('Earnings Calendar', C.accent))
  lines.push(blank())

  for (const e of earnings) {
    const days = e.days_until != null ? `${e.days_until}d` : ''
    const color = e.days_until != null && e.days_until <= 7 ? C.info : C.text
    lines.push(line(
      `  ${pad(e.symbol, 8)}${pad(e.date, 14)}${days}`,
      color
    ))
  }
  return lines
}

// ── Economic Calendar ────────────────────────────────
export function fmtCalendar(econ) {
  const lines = []
  if (!econ?.length) { lines.push(line('No economic events.', C.dim)); return lines }

  lines.push(line('Economic Calendar', C.accent))
  lines.push(blank())

  for (const ev of econ) {
    const days = ev.days_until != null ? `${ev.days_until}d` : ''
    const color = ev.days_until != null && ev.days_until <= 7 ? C.info : C.text
    lines.push(line(
      `  ${pad(ev.type, 8)}${pad(ev.date, 14)}${days}`,
      color
    ))
  }
  return lines
}

// ── Commodities ──────────────────────────────────────
export function fmtCommodities(commodities) {
  const lines = []
  if (!commodities) { lines.push(line('No commodity data.', C.dim)); return lines }

  for (const [category, items] of Object.entries(commodities)) {
    lines.push(line(category, C.info))
    for (const c of items) {
      const name = pad(c.name || c.symbol, 18)
      const price = rpad(fmtPrice(c.price, c.price < 10 ? 4 : 2), 12)
      const pct = fmtPct(c.pct)
      const unit = c.unit ? `  ${c.unit}` : ''
      lines.push(line(`  ${name}${price}${pct}${unit}`, changeColor(c.pct)))
    }
    lines.push(blank())
  }
  return lines
}

// ── Alerts ───────────────────────────────────────────
export function fmtAlerts(alerts) {
  const lines = []
  lines.push(line('Price Alerts', C.accent))
  lines.push(blank())

  if (!alerts?.length) {
    lines.push(line('  No active alerts.', C.dim))
    lines.push(line('  Usage: alert NVDA > 200', C.dim))
    return lines
  }

  for (const a of alerts) {
    lines.push(line(
      `  #${a.id}  ${pad(a.symbol, 6)} ${a.operator} ${fmtPrice(a.value)}`,
      C.text
    ))
  }
  return lines
}

// ── Memories ─────────────────────────────────────────
export function fmtMemories(memories) {
  const lines = []
  lines.push(line('Chat Memories', C.accent))
  lines.push(blank())

  if (!memories?.length) {
    lines.push(line('  No memories stored.', C.dim))
    lines.push(line('  Usage: memory save <text>', C.dim))
    return lines
  }

  for (const m of memories) {
    lines.push(line(`  #${m.id}  ${m.text}`, C.text))
  }
  return lines
}

// ── Journal ──────────────────────────────────────────
export function fmtJournal(entries) {
  const lines = []
  lines.push(line('Trade Journal', C.accent))
  lines.push(blank())

  if (!entries?.length) {
    lines.push(line('  No journal entries.', C.dim))
    lines.push(line('  Usage: journal <entry text>', C.dim))
    return lines
  }

  const shown = entries.slice(-20)
  for (const e of shown) {
    const date = new Date(e.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const syms = e.symbols?.length ? ` [${e.symbols.join(', ')}]` : ''
    lines.push(line(`  #${e.id}  ${date}${syms}`, C.dim))
    lines.push(line(`  ${e.text}`, C.text))
    lines.push(blank())
  }
  return lines
}

// ── Watchlist ────────────────────────────────────────
export function fmtWatchlist(symbols) {
  const lines = []
  lines.push(line('Watchlist', C.accent))
  lines.push(blank())

  if (!symbols?.length) {
    lines.push(line('  Using default watchlist from data.', C.dim))
    lines.push(line('  Usage: w NVDA (add) | uw NVDA (remove)', C.dim))
    return lines
  }

  lines.push(line(`  ${symbols.join('  ')}`, C.text))
  return lines
}
