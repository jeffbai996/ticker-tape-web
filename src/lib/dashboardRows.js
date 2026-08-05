import { BUCKETS } from './symbols.js'

/** Group a watchlist in its own selected order. Configured groups win, then
 * the built-in broad-universe buckets, then General. */
export function groupDashboardRows(watchlist, userGroups = {}) {
  const names = [
    ...Object.keys(userGroups),
    ...BUCKETS.map((bucket) => bucket.name),
  ]
  names.push('General')

  const grouped = new Map(names.map((name) => [name, []]))
  for (const symbol of watchlist) {
    const category = Object.entries(userGroups).find(([, symbols]) => symbols.includes(symbol))?.[0]
      || BUCKETS.find((bucket) => bucket.symbols.includes(symbol))?.name
      || 'General'
    if (!grouped.has(category)) grouped.set(category, [])
    grouped.get(category).push(symbol)
  }
  return [...grouped.entries()]
    .filter(([, symbols]) => symbols.length)
    .map(([name, symbols]) => ({ name, symbols }))
}

export function quoteSpread(quote) {
  if (quote?.bid == null || quote?.ask == null || quote.ask < quote.bid) return null
  return quote.ask - quote.bid
}

/** Flat dashboard selection. Numeric sorts are descending so the most active
 * item stays at the top; ties retain the user's manual order. */
export function selectFlatRows(watchlist, quotes, { filter = '', sort = 'manual' } = {}) {
  const needle = filter.trim().toUpperCase()
  const rows = watchlist.map((symbol, index) => ({
    symbol,
    index,
    quote: quotes[symbol]?.quote || null,
  })).filter(({ symbol, quote }) => !needle
    || symbol.includes(needle)
    || String(quote?.name || '').toUpperCase().includes(needle))

  if (sort === 'manual') return rows
  const value = (row) => {
    if (sort === 'symbol') return row.symbol
    if (sort === 'change') return row.quote?.pct
    if (sort === 'price') return row.quote?.price
    if (sort === 'spread') return quoteSpread(row.quote)
    return null
  }
  return [...rows].sort((a, b) => {
    if (sort === 'symbol') return a.symbol.localeCompare(b.symbol)
    const av = value(a)
    const bv = value(b)
    if (av == null && bv == null) return a.index - b.index
    if (av == null) return 1
    if (bv == null) return -1
    return bv - av || a.index - b.index
  })
}
