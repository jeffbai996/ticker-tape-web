/** Pure Movers-page shaping. Keeping the ranking out of the component makes
 * the meaning of each column testable instead of letting three inline sorts
 * quietly drift apart. */

export const MOVER_FLOORS = [0, 1, 2]

export function moverVolumeRatio(row) {
  if (row?.q?.volume == null || row?.q?.avgVolume == null) return null
  const volume = Number(row?.q?.volume)
  const average = Number(row?.q?.avgVolume)
  return Number.isFinite(volume) && Number.isFinite(average) && average > 0
    ? volume / average : null
}

export function buildMoverRows(symbols = [], quotes = {}) {
  return symbols
    .map((symbol) => {
      const data = quotes[symbol]
      const q = data?.quote
      return { symbol, data, q, name: q?.name || '', volRatio: moverVolumeRatio({ q }) }
    })
    .filter((row) => Number.isFinite(row.q?.pct))
}

export function filterMoverRows(rows = [], { query = '', minMove = 0 } = {}) {
  const needle = String(query).trim().toLowerCase()
  const floor = Number(minMove) || 0
  return rows.filter((row) => {
    if (Math.abs(row.q.pct) < floor) return false
    if (!needle) return true
    return row.symbol.toLowerCase().includes(needle)
      || row.name.toLowerCase().includes(needle)
  })
}

export function rankMoverRows(rows = [], mode = 'gainers') {
  const copy = [...rows]
  if (mode === 'gainers') {
    return copy.filter((row) => row.q.pct > 0)
      .sort((a, b) => b.q.pct - a.q.pct || a.symbol.localeCompare(b.symbol))
  }
  if (mode === 'losers') {
    return copy.filter((row) => row.q.pct < 0)
      .sort((a, b) => a.q.pct - b.q.pct || a.symbol.localeCompare(b.symbol))
  }
  if (mode === 'active') {
    return copy.sort((a, b) => {
      const ar = a.volRatio
      const br = b.volRatio
      if (ar != null || br != null) return (br ?? -1) - (ar ?? -1)
      return (b.q.volume ?? 0) - (a.q.volume ?? 0)
        || Math.abs(b.q.pct) - Math.abs(a.q.pct)
    })
  }
  return copy
}
