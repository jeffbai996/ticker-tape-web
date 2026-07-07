// Backtest / thesis-replay core — realized equity-curve reconstruction.
// Port of the CLI terminal's backtest core: pure (fills, bars, benchmark) →
// result, no I/O, no rendering. "What did the book actually do vs the
// benchmark since the first fill" — a factual replay, not an optimizer.
//
// Honesty contract (same as the CLI): missing data never fabricates a value.
// An absent price carries the last-known one, an absent benchmark yields
// null (not a fake 0), an empty book yields an empty result. No look-ahead:
// a fill on day T applies only when the walk reaches T.

// ── fills CSV (ledger format shared with the CLI: optional currency col) ──

export function parseFillsCsv(text) {
  const lines = (text || '').trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const cols = lines[0].split(',').map((c) => c.trim().toLowerCase())
  const idx = Object.fromEntries(cols.map((c, i) => [c, i]))
  if (!('date' in idx) || !('symbol' in idx) || !('side' in idx) || !('qty' in idx) || !('price' in idx)) return []

  const fills = []
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim())
    const date = cells[idx.date]
    const symbol = (cells[idx.symbol] || '').toUpperCase()
    const side = (cells[idx.side] || '').toUpperCase()
    const qty = Number(cells[idx.qty])
    const price = Number(cells[idx.price])
    const currency = ((idx.currency != null && cells[idx.currency]) || 'USD').toUpperCase()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !symbol) continue
    if ((side !== 'BUY' && side !== 'SELL') || !(qty > 0) || !(price > 0)) continue
    fills.push({ date, symbol, side, qty, price, currency })
  }
  fills.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.symbol < b.symbol ? -1 : 1))
  return fills
}

// ── FX normalization (mixed CAD/USD books) ────────────────────────────────
// The core is single-currency by design; convert everything to the report
// currency FIRST. usdcad = { 'YYYY-MM-DD': CAD per 1 USD }. Each amount
// converts at ITS OWN date's rate; gaps carry the last-known rate; a date
// before the series uses the first available rate.

export function symbolCurrency(symbol) {
  return /\.(NE|TO|V)$/i.test(symbol) ? 'CAD' : 'USD'
}

function rateFor(usdcad, date) {
  const days = Object.keys(usdcad).sort()
  if (!days.length) throw new Error('FX conversion needed but no USDCAD data')
  if (usdcad[date] != null) return usdcad[date]
  let last = null
  for (const d of days) {
    if (d > date) break
    last = usdcad[d]
  }
  return last ?? usdcad[days[0]]
}

function convertAmount(amount, ccy, reportCcy, date, usdcad) {
  if (ccy === reportCcy) return amount
  const rate = rateFor(usdcad, date)
  if (ccy === 'USD' && reportCcy === 'CAD') return amount * rate
  if (ccy === 'CAD' && reportCcy === 'USD') return amount / rate
  throw new Error(`unsupported currency pair ${ccy}->${reportCcy}`)
}

export function convertFills(fills, reportCcy, usdcad) {
  return fills.map((f) => ({
    ...f,
    price: convertAmount(f.price, f.currency || 'USD', reportCcy, f.date, usdcad),
    currency: reportCcy,
  }))
}

export function convertBars(bars, ccyBySymbol, reportCcy, usdcad) {
  const out = {}
  for (const [sym, series] of Object.entries(bars)) {
    const ccy = ccyBySymbol[sym] || symbolCurrency(sym)
    if (ccy === reportCcy) {
      out[sym] = series
      continue
    }
    out[sym] = Object.fromEntries(
      Object.entries(series).map(([d, px]) => [d, convertAmount(px, ccy, reportCcy, d, usdcad)]),
    )
  }
  return out
}

export function needsFx(fills, reportCcy, benchCcy) {
  if (benchCcy !== reportCcy) return true
  return fills.some((f) => (f.currency || 'USD') !== reportCcy)
}

// ── equity curve ──────────────────────────────────────────────────────────

export function assembleBacktest(fills, bars, benchmark) {
  if (!fills.length) return { dates: [], book: [], bench: [], marks: [], stats: null, horizonStart: null }

  const sorted = [...fills].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const horizonStart = sorted[0].date

  // trading days: union of every price series, the benchmark's calendar,
  // and fill dates, from the first fill on
  const daySet = new Set()
  for (const series of Object.values(bars)) for (const d of Object.keys(series)) if (d >= horizonStart) daySet.add(d)
  for (const d of Object.keys(benchmark)) if (d >= horizonStart) daySet.add(d)
  for (const f of sorted) daySet.add(f.date)
  const dates = [...daySet].sort()
  if (!dates.length) return { dates: [], book: [], bench: [], marks: [], stats: null, horizonStart: null }

  const fillsByDay = {}
  for (const f of sorted) (fillsByDay[f.date] ||= []).push(f)

  // equity(day) = cost basis of all buys + realized + unrealized (avg cost,
  // so partial exits are exact); principal stays in the book across a
  // round-trip so the curve reads as account value, not just P&L
  const qty = {}
  const avgCost = {}
  const lastPrice = {}
  let cumulativeBasis = 0
  let realized = 0

  const book = []
  for (const day of dates) {
    for (const f of fillsByDay[day] || []) {
      const held = qty[f.symbol] || 0
      if (f.side === 'BUY') {
        cumulativeBasis += f.qty * f.price
        const newQty = held + f.qty
        avgCost[f.symbol] = ((avgCost[f.symbol] || 0) * held + f.qty * f.price) / newQty
        qty[f.symbol] = newQty
      } else {
        const basis = avgCost[f.symbol] ?? f.price
        realized += f.qty * (f.price - basis)
        qty[f.symbol] = held - f.qty
      }
    }
    let unrealized = 0
    for (const [sym, held] of Object.entries(qty)) {
      if (!held) continue
      const px = bars[sym]?.[day] ?? lastPrice[sym]
      if (px == null) continue
      lastPrice[sym] = px
      unrealized += held * (px - avgCost[sym])
    }
    book.push(cumulativeBasis + realized + unrealized)
  }

  const bench = benchmarkCurve(benchmark, dates, book[0])
  const marks = sorted.map((f) => ({ date: f.date, symbol: f.symbol, side: f.side, qty: f.qty, price: f.price }))
  return { dates, book, bench, marks, stats: computeStats(book, bench), horizonStart }
}

// Buy-and-hold the benchmark with the book's starting capital, normalized so
// the first day WITH data equals bookStart — the curve gap IS the alpha.
function benchmarkCurve(benchmark, dates, bookStart) {
  if (!Object.keys(benchmark).length || !dates.length) return []
  let base = null
  for (const d of dates) {
    if (benchmark[d] != null) {
      base = benchmark[d]
      break
    }
  }
  if (!base) return []
  const curve = []
  let last = base
  for (const d of dates) {
    const px = benchmark[d] ?? last
    last = px
    curve.push((bookStart * px) / base)
  }
  return curve
}

function pct(start, end) {
  return start ? ((end - start) / start) * 100 : null
}

function computeStats(book, bench) {
  if (!book.length) return null
  const bookReturnPct = pct(book[0], book[book.length - 1]) ?? 0
  const benchmarkReturnPct = bench.length ? pct(bench[0], bench[bench.length - 1]) : null
  const alphaPct = benchmarkReturnPct != null ? bookReturnPct - benchmarkReturnPct : null

  let peak = book[0]
  let maxDrawdownPct = 0
  for (const v of book) {
    if (v > peak) peak = v
    if (peak > 0) maxDrawdownPct = Math.min(maxDrawdownPct, ((v - peak) / peak) * 100)
  }
  return { bookReturnPct, benchmarkReturnPct, alphaPct, maxDrawdownPct }
}
