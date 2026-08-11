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

/** Which slot a drag is hovering, from row geometry measured once at
 * pointerdown. `rows` are {symbol, top, bottom} in visual order and `y` is
 * board-relative, so a page scroll mid-drag can't drift the answer.
 * Returns {before: SYM} for "insert above SYM" or {after: SYM} for the tail
 * slot — the tail is expressed relative to a row because a scope (one sector
 * group) is only a slice of the underlying list. */
export function dropSlot(rows, y) {
  if (!rows?.length) return null
  for (const row of rows) {
    if (y < (row.top + row.bottom) / 2) return { before: row.symbol }
  }
  return { after: rows[rows.length - 1].symbol }
}

/** Translate a hovered slot into the one placement the watchlist mutators
 * understand: {before} for placeSymbol/moveWatchlistSymbol, {toEnd} for the
 * nudge path (no anchor exists past the last row). Returns null when the drop
 * would leave the list exactly as it is — a no-op write still fires the
 * storage listeners and re-renders the whole board. */
export function resolveDrop(list, symbol, slot) {
  if (!slot || !symbol) return null
  const from = list.indexOf(symbol)
  if (from < 0) return null
  let before = slot.before
  if (before == null) {
    const anchor = list.indexOf(slot.after)
    if (anchor < 0) return null
    before = anchor + 1 < list.length ? list[anchor + 1] : null
  }
  if (before === symbol) return null
  if (before == null) return from === list.length - 1 ? null : { toEnd: true }
  const to = list.indexOf(before)
  if (to < 0 || to === from + 1) return null
  return { before }
}

/** Board breadth for the hamburger menu's corner panel: how the visible
 * watchlist leans right now, plus the two extremes. Rows without a pct
 * (halted, unfetched) are ignored rather than counted as flat. */
export function boardBreadth(rows) {
  const live = (rows || []).filter((r) => r?.pct != null && !Number.isNaN(r.pct))
  if (!live.length) return null
  let up = 0, down = 0, flat = 0
  let best = live[0], worst = live[0]
  for (const r of live) {
    if (r.pct > 0) up++
    else if (r.pct < 0) down++
    else flat++
    if (r.pct > best.pct) best = r
    if (r.pct < worst.pct) worst = r
  }
  return { up, down, flat, best: { symbol: best.symbol, pct: best.pct }, worst: { symbol: worst.symbol, pct: worst.pct } }
}
