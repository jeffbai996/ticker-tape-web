// Aggregations behind the dashboard rail widgets. Pure: rows in, rows out —
// the panels only decide how to paint them.

/**
 * Average move per group, hottest first. A concentrated book lives or dies by
 * where the money is rotating, and reading that off 30 individual rows is work
 * the rail should have already done.
 *
 * `groups` is [{ name, symbols }]; `quotes` is the dashboard's {SYM: {quote}}
 * map. Groups with no live quote drop out rather than render as a flat zero.
 */
export function groupHeat(groups, quotes) {
  const rows = []
  for (const g of groups || []) {
    const moves = (g.symbols || [])
      .map((s) => quotes?.[s]?.quote?.pct)
      .filter((v) => Number.isFinite(v))
    if (!moves.length) continue
    const avg = moves.reduce((a, b) => a + b, 0) / moves.length
    rows.push({
      name: g.name,
      avg,
      count: moves.length,
      up: moves.filter((v) => v > 0).length,
    })
  }
  return rows.sort((a, b) => b.avg - a.avg)
}

/**
 * How close an armed alert is to firing, as a signed percentage of the
 * trigger level. Negative = still short of it. Non-price alerts (RSI, SMA
 * cross, volume) have no comparable price distance, so they report null and
 * the panel just lists the condition.
 */
export function alertDistance(alert, price) {
  if (!alert || alert.type !== 'price' || !Number.isFinite(price)) return null
  if (!Number.isFinite(alert.value) || alert.value === 0) return null
  const gap = ((price - alert.value) / alert.value) * 100
  // `>` alerts want price ABOVE the level, `<` alerts want it below — sign the
  // gap so "closer to firing" always means closer to zero from below.
  return alert.operator === '<' ? -gap : gap
}

/** Armed alerts nearest to firing first; triggered ones sink to the bottom. */
export function rankAlerts(alerts, priceMap) {
  return (alerts || [])
    .map((a) => ({ alert: a, gap: alertDistance(a, priceMap?.[a.symbol]) }))
    .sort((x, y) => {
      if (!!x.alert.triggered !== !!y.alert.triggered) return x.alert.triggered ? 1 : -1
      if (x.gap == null || y.gap == null) return (x.gap == null) - (y.gap == null)
      return Math.abs(x.gap) - Math.abs(y.gap)
    })
}

/**
 * Session extremes across the board: who is printing at the top and bottom of
 * their own day range, which is where breakouts and breakdowns announce
 * themselves before the % column notices.
 */
export function rangeExtremes(rows, limit = 3) {
  const scored = []
  for (const r of rows || []) {
    const q = r.quote || r
    // the feed calls them dayLow/dayHigh; accept the bare names too so a
    // caller passing raw chart bars gets the same answer
    const low = q.dayLow ?? q.low
    const high = q.dayHigh ?? q.high
    const price = q.price
    if (![low, high, price].every(Number.isFinite) || high <= low) continue
    scored.push({ symbol: q.symbol ?? r.symbol, pos: (price - low) / (high - low), pct: q.pct })
  }
  scored.sort((a, b) => b.pos - a.pos)
  return {
    highs: scored.filter((s) => s.pos >= 0.9).slice(0, limit),
    lows: scored.filter((s) => s.pos <= 0.1).reverse().slice(0, limit),
  }
}
