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

export function sparkFromChart(result) {
  const closes = result?.indicators?.quote?.[0]?.close || []
  return closes.filter((c) => c != null)
}
