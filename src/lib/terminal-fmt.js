// Terminal text formatters: each function returns [{ text, color }] for inline rendering.
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
function blank() { return line('') }
function divider(label) {
  const pad = label ? ` ${label} ` : ''
  const dashes = '─'.repeat(Math.max(2, 40 - pad.length))
  return line(`──${pad}${dashes}`, C.dim)
}
function changeColor(n) { return n > 0 ? C.pos : n < 0 ? C.neg : C.text }
function pad(s, len) { return String(s).padEnd(len) }
function rpad(s, len) { return String(s).padStart(len) }

// ── Thesis Overview ──────────────────────────────────
export function fmtThesis(quotes, technicals, earnings) {
  const lines = []
  if (!quotes?.length) { lines.push(line('No quote data available.', C.dim)); return lines }

  // Summary header
  const up = quotes.filter(q => q.pct > 0).length
  const down = quotes.filter(q => q.pct < 0).length
  const avg = quotes.reduce((s, q) => s + (q.pct || 0), 0) / quotes.length
  lines.push(line(
    `${quotes.length} symbols | Avg ${fmtPct(avg)} | ▲${up} ▼${down}`,
    C.accent
  ))
  lines.push(blank())

  for (const q of quotes) {
    const sym = q.symbol
    const ta = technicals?.[sym]
    const er = earnings?.find(e => e.symbol === sym)

    // Line 1: SYMBOL  NAME
    lines.push(line(`${pad(sym, 6)}${q.name || sym}`, C.accent))

    // Line 2: price  change  pct    RSI  signals
    let detail = `  ${fmtPrice(q.price)}  ${fmtChange(q.change)}  ${fmtPct(q.pct)}`
    if (ta) {
      detail += `    RSI ${Math.round(ta.rsi || 0)}`
      if (ta.trend_signals?.length) detail += `  ${ta.trend_signals.join('  ')}`
    }
    lines.push(line(detail, changeColor(q.pct)))

    // Line 3: extended hours + earnings
    let extLine = ''
    if (q.ext_price != null) {
      extLine += `  ${q.ext_label || 'AH'} ${fmtPrice(q.ext_price)}  ${fmtPct(q.ext_pct)}`
    }
    if (er) {
      extLine += `    EPS ${er.days_until}d`
    }
    if (extLine) lines.push(line(extLine, C.ext))

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
      const name = pad(item.name || item.symbol, 18)
      const price = rpad(fmtPrice(item.price, item.price < 10 ? 4 : 2), 12)
      const pct = fmtPct(item.pct)
      lines.push(line(`  ${name}${price}${pct}`, changeColor(item.pct)))
    }
    lines.push(blank())
  }
  return lines
}

// ── Technicals ───────────────────────────────────────
export function fmtTechnicals(ta, symbol) {
  const lines = []
  if (!ta) { lines.push(line(`No technicals for ${symbol}.`, C.dim)); return lines }

  lines.push(line(`${symbol} Technical Analysis`, C.accent))
  lines.push(blank())

  // Moving Averages
  lines.push(divider('Moving Averages'))
  lines.push(line(`  Current     ${fmtPrice(ta.current)}`, C.white))
  const smas = [
    { label: 'SMA 20', val: ta.sma_20 },
    { label: 'SMA 50', val: ta.sma_50 },
    { label: 'SMA 200', val: ta.sma_200 },
  ]
  for (const sma of smas) {
    if (sma.val == null) continue
    const diff = ((ta.current - sma.val) / sma.val) * 100
    const rel = diff >= 0 ? 'above' : 'below'
    lines.push(line(
      `  ${pad(sma.label, 12)}${fmtPrice(sma.val)}  ${fmtPct(diff)} ${rel}`,
      changeColor(diff)
    ))
  }
  lines.push(blank())

  // Momentum
  lines.push(divider('Momentum'))
  const rsi = ta.rsi != null ? Math.round(ta.rsi) : null
  const rsiLabel = rsi == null ? '' : rsi >= 70 ? 'Overbought' : rsi <= 30 ? 'Oversold' : 'Neutral'
  const rsiColor = rsi == null ? C.dim : rsi >= 70 ? C.neg : rsi <= 30 ? C.pos : C.text
  if (rsi != null) lines.push(line(`  RSI (14)    ${rsi}  ${rsiLabel}`, rsiColor))
  if (ta.macd != null) lines.push(line(`  MACD        ${ta.macd.toFixed(3)}`, C.text))
  if (ta.macd_signal != null) lines.push(line(`  Signal      ${ta.macd_signal.toFixed(3)}`, C.text))
  if (ta.macd_histogram != null) {
    const h = ta.macd_histogram
    lines.push(line(`  Histogram   ${h > 0 ? '+' : ''}${h.toFixed(3)}`, changeColor(h)))
  }
  if (ta.macd_crossover) lines.push(line(`  Crossover   ${ta.macd_crossover}`, C.info))
  lines.push(blank())

  // Volatility
  lines.push(divider('Volatility'))
  if (ta.bb_upper != null) lines.push(line(`  BB Upper    ${fmtPrice(ta.bb_upper)}`, C.text))
  if (ta.bb_lower != null) lines.push(line(`  BB Lower    ${fmtPrice(ta.bb_lower)}`, C.text))
  if (ta.atr != null) {
    const atrPct = ta.atr_pct != null ? `  (${ta.atr_pct.toFixed(2)}%)` : ''
    lines.push(line(`  ATR         ${ta.atr.toFixed(2)}${atrPct}`, C.text))
  }
  if (ta.vol_ratio != null) lines.push(line(`  Vol Ratio   ${ta.vol_ratio.toFixed(2)}x`, C.text))
  lines.push(blank())

  // Range
  lines.push(divider('Range'))
  if (ta.high_52w != null) lines.push(line(
    `  52w High    ${fmtPrice(ta.high_52w)}  ${fmtPct(ta.off_high)} off`,
    C.neg
  ))
  if (ta.low_52w != null) lines.push(line(
    `  52w Low     ${fmtPrice(ta.low_52w)}  ${fmtPct(ta.off_low)} off`,
    C.pos
  ))
  if (ta.rs_vs_bench != null) lines.push(line(
    `  RS vs QQQ   ${fmtPct(ta.rs_vs_bench)}`,
    changeColor(ta.rs_vs_bench)
  ))

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
  lines.push(line(`${symbol}  ${n}`, C.accent))
  lines.push(line(`${data.sector || ''} | ${data.industry || ''}`, C.info))
  lines.push(blank())

  // Price info
  lines.push(divider('Price'))
  lines.push(line(`  Price           ${fmtPrice(data.currentPrice || data.regularMarketPrice)}`, C.white))
  if (data.regularMarketChange != null) {
    lines.push(line(
      `  Change          ${fmtChange(data.regularMarketChange)}  ${fmtPct(data.regularMarketChangePercent)}`,
      changeColor(data.regularMarketChange)
    ))
  }
  if (data.postMarketPrice != null) {
    lines.push(line(
      `  After Hours     ${fmtPrice(data.postMarketPrice)}  ${fmtPct(data.postMarketChangePercent)}`,
      C.ext
    ))
  }
  lines.push(blank())

  // Valuation
  lines.push(divider('Valuation'))
  if (data.marketCap != null) lines.push(line(`  Market Cap      ${fmtCap(data.marketCap)}`, C.text))
  if (data.trailingPE != null) lines.push(line(`  P/E (TTM)       ${data.trailingPE.toFixed(2)}`, C.text))
  if (data.forwardPE != null) lines.push(line(`  P/E (Fwd)       ${data.forwardPE.toFixed(2)}`, C.text))
  if (data.priceToSalesTrailing12Months != null) lines.push(line(`  P/S             ${data.priceToSalesTrailing12Months.toFixed(2)}`, C.text))
  if (data.priceToBook != null) lines.push(line(`  P/B             ${data.priceToBook.toFixed(2)}`, C.text))
  if (data.trailingPegRatio != null) lines.push(line(`  PEG             ${data.trailingPegRatio.toFixed(2)}`, C.text))
  if (data.enterpriseToRevenue != null) lines.push(line(`  EV/Revenue      ${data.enterpriseToRevenue.toFixed(2)}`, C.text))
  if (data.enterpriseToEbitda != null) lines.push(line(`  EV/EBITDA       ${data.enterpriseToEbitda.toFixed(2)}`, C.text))
  lines.push(blank())

  // Financials
  lines.push(divider('Financials'))
  if (data.totalRevenue != null) lines.push(line(`  Revenue         ${fmtCap(data.totalRevenue)}`, C.text))
  if (data.grossMargins != null) lines.push(line(`  Gross Margin    ${(data.grossMargins * 100).toFixed(1)}%`, C.text))
  if (data.operatingMargins != null) lines.push(line(`  Op Margin       ${(data.operatingMargins * 100).toFixed(1)}%`, C.text))
  if (data.profitMargins != null) lines.push(line(`  Net Margin      ${(data.profitMargins * 100).toFixed(1)}%`, C.text))
  if (data.returnOnEquity != null) lines.push(line(`  ROE             ${(data.returnOnEquity * 100).toFixed(1)}%`, C.text))
  if (data.revenueGrowth != null) lines.push(line(`  Rev Growth      ${fmtPct(data.revenueGrowth * 100)}`, changeColor(data.revenueGrowth)))
  if (data.earningsGrowth != null) lines.push(line(`  EPS Growth      ${fmtPct(data.earningsGrowth * 100)}`, changeColor(data.earningsGrowth)))
  lines.push(blank())

  // Balance Sheet
  lines.push(divider('Balance Sheet'))
  if (data.totalCash != null) lines.push(line(`  Cash            ${fmtCap(data.totalCash)}`, C.text))
  if (data.totalDebt != null) lines.push(line(`  Debt            ${fmtCap(data.totalDebt)}`, C.text))
  if (data.debtToEquity != null) lines.push(line(`  D/E             ${data.debtToEquity.toFixed(2)}`, C.text))
  if (data.currentRatio != null) lines.push(line(`  Current Ratio   ${data.currentRatio.toFixed(2)}`, C.text))
  if (data.quickRatio != null) lines.push(line(`  Quick Ratio     ${data.quickRatio.toFixed(2)}`, C.text))
  lines.push(blank())

  // Shares & Short
  lines.push(divider('Shares'))
  if (data.sharesOutstanding != null) lines.push(line(`  Shares Out      ${fmtCompact(data.sharesOutstanding)}`, C.text))
  if (data.floatShares != null) lines.push(line(`  Float           ${fmtCompact(data.floatShares)}`, C.text))
  if (data.shortPercentOfFloat != null) lines.push(line(`  Short % Float   ${(data.shortPercentOfFloat * 100).toFixed(2)}%`, C.text))
  if (data.heldPercentInsiders != null) lines.push(line(`  Insider %       ${(data.heldPercentInsiders * 100).toFixed(1)}%`, C.text))
  if (data.heldPercentInstitutions != null) lines.push(line(`  Inst %          ${(data.heldPercentInstitutions * 100).toFixed(1)}%`, C.text))
  lines.push(blank())

  // Analyst
  lines.push(divider('Analyst'))
  if (data.recommendationKey) lines.push(line(`  Rating          ${data.recommendationKey.replace('_', ' ').toUpperCase()}`, C.info))
  if (data.numberOfAnalystOpinions) lines.push(line(`  Analysts        ${data.numberOfAnalystOpinions}`, C.text))
  if (data.targetMeanPrice != null) lines.push(line(`  Target (mean)   ${fmtPrice(data.targetMeanPrice)}`, C.text))
  if (data.targetHighPrice != null && data.targetLowPrice != null) {
    lines.push(line(`  Range           ${fmtPrice(data.targetLowPrice)} — ${fmtPrice(data.targetHighPrice)}`, C.text))
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
