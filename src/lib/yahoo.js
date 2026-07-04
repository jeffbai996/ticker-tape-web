// Pure transforms over Yahoo v8 /finance/chart results. One chart call per
// symbol yields quote + sparkline + bars, and unlike v7/quote it needs no
// crumb/cookie auth — which is what lets the whole app run through a dumb
// pass-through proxy with zero secrets.

export function quoteFromChart(result) {
  const m = result?.meta || {}
  const price = m.regularMarketPrice ?? 0
  const prev = m.previousClose ?? m.chartPreviousClose
  const change = prev != null && price ? price - prev : 0
  const pct = prev ? (change / prev) * 100 : 0

  return {
    symbol: m.symbol || '',
    name: m.shortName || m.longName || '',
    price,
    change,
    pct,
    prevClose: prev ?? null,
    dayHigh: m.regularMarketDayHigh ?? null,
    dayLow: m.regularMarketDayLow ?? null,
    volume: m.regularMarketVolume ?? null,
    marketTime: m.regularMarketTime ?? null,
  }
}

/** Same quote shape from a v7 /finance/quote row (batch endpoint, crumb-authed).
 *  change/pct are re-derived from price vs previousClose: for yield indices
 *  (^TNX) the reported regularMarketChange fields are garbage (-50% on an
 *  unchanged price) while price/prevClose are consistent. */
export function quoteFromV7(row) {
  const price = row?.regularMarketPrice ?? 0
  const prev = row?.regularMarketPreviousClose ?? null
  const change = prev != null && price ? price - prev : (row?.regularMarketChange ?? 0)
  const pct = prev ? (change / prev) * 100 : (row?.regularMarketChangePercent ?? 0)
  return {
    symbol: row?.symbol || '',
    name: row?.shortName || row?.longName || '',
    price,
    change,
    pct,
    prevClose: prev,
    dayHigh: row?.regularMarketDayHigh ?? null,
    dayLow: row?.regularMarketDayLow ?? null,
    volume: row?.regularMarketVolume ?? null,
    marketTime: row?.regularMarketTime ?? null,
  }
}

export function sparkFromChart(result) {
  const closes = result?.indicators?.quote?.[0]?.close || []
  return closes.filter((c) => c != null)
}

/** OHLC bars for candlestick charts; bars with a null close are dropped. */
export function barsFromChart(result) {
  const ts = result?.timestamp || []
  const q = result?.indicators?.quote?.[0] || {}
  const bars = []
  for (let i = 0; i < ts.length; i++) {
    if (q.close?.[i] == null) continue
    bars.push({
      time: ts[i],
      open: q.open?.[i] ?? q.close[i],
      high: q.high?.[i] ?? q.close[i],
      low: q.low?.[i] ?? q.close[i],
      close: q.close[i],
      volume: q.volume?.[i] ?? null,
    })
  }
  return bars
}
