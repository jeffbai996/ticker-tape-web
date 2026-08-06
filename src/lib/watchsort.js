// Sidebar watchlist ordering. The stored list is the user's own arrangement,
// so sorting is a view state — it never rewrites the watchlist itself.

/** Click cycle for one column: desc → asc → back to the stored order. */
export function nextSort(current, key) {
  if (current?.key !== key) return { key, dir: key === 'sym' ? 'asc' : 'desc' }
  if (current.dir === 'desc') return { key, dir: 'asc' }
  return null
}

export function sortSymbols(symbols, quotes = {}, sort = null) {
  const list = [...(symbols || [])]
  if (!sort) return list
  const sign = sort.dir === 'asc' ? 1 : -1

  if (sort.key === 'sym') {
    return list.sort((a, b) => sign * a.localeCompare(b))
  }

  // Unpriced names sort to the bottom in BOTH directions: a missing quote is
  // not "down the most", and having it head the list on an ascending sort
  // would bury the actual losers.
  const pct = (s) => quotes[s]?.quote?.pct
  return list.sort((a, b) => {
    const x = pct(a)
    const y = pct(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return sign * (x - y)
  })
}
