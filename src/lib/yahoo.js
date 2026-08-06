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
    name: m.longName || m.shortName || '',   // shortName is Yahoo-truncated at 31 chars
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

  // Extended hours: post-market after the close, pre-market before the open.
  let ext = {}
  if (row?.preMarketPrice != null && (row?.marketState === 'PRE' || row?.marketState === 'PREPRE')) {
    ext = { extLabel: 'PM', extPrice: row.preMarketPrice, extPct: row.preMarketChangePercent ?? null }
  // PREPRE is the dead zone between the 8pm ET after-hours close and the 4am
  // pre-market open: Yahoo has already flipped the state but preMarketPrice is
  // still null, so without PREPRE here every AH print vanished overnight
  // (Jeff 2026-08-04, 00:07 ET). The last after-hours trade is still the right
  // number to show; the PM branch above takes over the moment 4am fills it in.
  } else if (row?.postMarketPrice != null && (row?.marketState === 'POST' || row?.marketState === 'POSTPOST' || row?.marketState === 'CLOSED' || row?.marketState === 'PREPRE')) {
    ext = { extLabel: 'AH', extPrice: row.postMarketPrice, extPct: row.postMarketChangePercent ?? null }
  }

  return {
    symbol: row?.symbol || '',
    name: row?.longName || row?.shortName || '',   // shortName is Yahoo-truncated
    price,
    change,
    pct,
    prevClose: prev,
    dayHigh: row?.regularMarketDayHigh ?? null,
    dayLow: row?.regularMarketDayLow ?? null,
    volume: row?.regularMarketVolume ?? null,
    marketTime: row?.regularMarketTime ?? null,
    // v7 uses the short field names here (not regularMarketBid/Ask).
    bid: row?.bid ?? null,
    ask: row?.ask ?? null,
    ...ext,
  }
}

/** Merge one Yahoo streamer tick into the richer snapshot quote shape. */
export function quoteFromStream(tick, previous = {}) {
  if (!tick?.symbol || tick.price == null) return previous
  const marketTime = tick.time != null ? Math.floor(tick.time / 1000) : previous.marketTime
  const base = {
    ...previous,
    symbol: tick.symbol,
    name: previous.name || tick.shortName || '',
  }

  // 0 PRE, 1 REGULAR, 2 POST, 3 EXTENDED, 4 OVERNIGHT. Non-regular ticks are
  // measured from the cash close, so they belong in the secondary quote, not
  // in the regular-price column. Yahoo's live stream currently emits Blue
  // Ocean overnight equity prints as 4; keep 3 as generic AH.
  if ([0, 2, 3, 4].includes(tick.marketHours)) {
    return {
      ...base,
      extLabel: tick.marketHours === 0 ? 'PM' : tick.marketHours === 4 ? 'ON' : 'AH',
      extPrice: tick.price,
      extPct: tick.changePercent ?? previous.extPct ?? null,
      extChange: tick.change ?? previous.extChange ?? null,
      extMarketTime: marketTime,
    }
  }

  // A regular print makes any persisted extended-session adornment stale.
  const { extLabel, extPrice, extPct, extChange, extMarketTime, ...regular } = base
  return {
    ...regular,
    price: tick.price,
    change: tick.change ?? previous.change ?? 0,
    pct: tick.changePercent ?? previous.pct ?? 0,
    volume: tick.dayVolume ?? previous.volume ?? null,
    dayHigh: tick.dayHigh ?? previous.dayHigh ?? null,
    dayLow: tick.dayLow ?? previous.dayLow ?? null,
    marketTime,
    bid: tick.bid ?? previous.bid,
    ask: tick.ask ?? previous.ask,
    lastSize: tick.lastSize ?? previous.lastSize,
  }
}

/** A snapshot enriches range/name data but cannot rewind a fresh live print. */
export function mergeSnapshotQuote(previous, snapshot, streamIsFresh) {
  if (!streamIsFresh || !previous) return snapshot
  return {
    ...snapshot,
    name: snapshot.name || previous.name || '',
    price: previous.price ?? snapshot.price,
    change: previous.change ?? snapshot.change,
    pct: previous.pct ?? snapshot.pct,
    volume: previous.volume ?? snapshot.volume,
    marketTime: previous.marketTime ?? snapshot.marketTime,
    dayHigh: snapshot.dayHigh ?? previous.dayHigh ?? null,
    dayLow: snapshot.dayLow ?? previous.dayLow ?? null,
    bid: previous.bid ?? snapshot.bid ?? null,
    ask: previous.ask ?? snapshot.ask ?? null,
    ...(previous.extLabel ? {
      extLabel: previous.extLabel,
      extPrice: previous.extPrice,
      extPct: previous.extPct,
      extChange: previous.extChange,
      extMarketTime: previous.extMarketTime,
    } : {}),
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
