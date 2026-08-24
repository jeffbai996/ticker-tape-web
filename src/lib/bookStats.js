/** Analytics for a hand-built book (Jeff 2026-08-21).
 *
 *  Every function takes the SAME `rows` array `portfolioValues` returns and
 *  nothing else — no quotes, no rates, no fetch. That is deliberate: a card
 *  computed from a second source eventually disagrees with the table above
 *  it, and a portfolio page that contradicts itself is worse than one with
 *  fewer cards.
 *
 *  Rows that never priced carry `valueDisplay: null` and are excluded
 *  everywhere; cash rows carry `kind: 'cash'` and are excluded from anything
 *  that is about positions (concentration, breadth, cost basis) but counted
 *  in anything that is about the book (cash split).
 */

const priced = (rows) => (rows || []).filter((r) => r && r.valueDisplay != null)
const positions = (rows) => priced(rows).filter((r) => r.kind !== 'cash')

/** How much of the book is one bet. Weights are renormalised across
 *  POSITIONS, so a book holding 50% cash does not read as diversified when
 *  its equity sleeve is a single name. HHI is the Herfindahl index on those
 *  weights; `effectiveN` is 10,000/HHI — the number of equal-sized positions
 *  that would concentrate the same way. */
export function concentration(rows) {
  const held = positions(rows)
  const total = held.reduce((s, r) => s + r.valueDisplay, 0)
  if (!held.length || total <= 0) {
    return { top1: null, top3: null, top5: null, hhi: null, effectiveN: null, count: 0 }
  }
  const weights = held.map((r) => (r.valueDisplay / total) * 100).sort((a, b) => b - a)
  const head = (n) => weights.slice(0, n).reduce((s, w) => s + w, 0)
  const hhi = weights.reduce((s, w) => s + w * w, 0)
  return {
    top1: head(1),
    top3: head(3),
    top5: head(5),
    hhi,
    effectiveN: hhi > 0 ? 1e4 / hhi : null,
    count: held.length,
  }
}

/** Direction count plus the two ends of the day. A position that printed
 *  exactly flat is flat — rounding it into the winners would overstate
 *  breadth on a quiet day, which is exactly the day breadth is read. */
export function breadth(rows) {
  const held = positions(rows).filter((r) => typeof r.dayPct === 'number')
  let up = 0
  let down = 0
  let flat = 0
  for (const r of held) {
    if (r.dayPct > 0) up += 1
    else if (r.dayPct < 0) down += 1
    else flat += 1
  }
  const byPct = held.slice().sort((a, b) => b.dayPct - a.dayPct)
  return { up, down, flat, best: byPct[0] || null, worst: byPct[byPct.length - 1] || null }
}

/** The book against what it cost. Cost basis is recovered as value minus
 *  unrealized rather than re-converted from the entered cost — the same
 *  arithmetic the table already showed, so the two can never drift apart.
 *  Only positions carrying a cost basis take part; `covered` says how many. */
export function unrealizedStats(rows) {
  const held = positions(rows).filter((r) => r.unrealDisplay != null)
  if (!held.length) {
    return { costBasis: null, pnl: null, pct: null, best: null, worst: null, covered: 0 }
  }
  const pnl = held.reduce((s, r) => s + r.unrealDisplay, 0)
  const costBasis = held.reduce((s, r) => s + (r.valueDisplay - r.unrealDisplay), 0)
  const withPct = held.map((r) => {
    const basis = r.valueDisplay - r.unrealDisplay
    return { ...r, unrealPct: basis > 0 ? (r.unrealDisplay / basis) * 100 : null }
  }).filter((r) => r.unrealPct != null).sort((a, b) => b.unrealPct - a.unrealPct)
  return {
    costBasis,
    pnl,
    pct: costBasis > 0 ? (pnl / costBasis) * 100 : null,
    best: withPct[0] || null,
    worst: withPct[withPct.length - 1] || null,
    covered: held.length,
  }
}

/** Who actually moved the book today. Share is of GROSS day P&L (the sum of
 *  absolute moves), not of the net: on a day where a winner and a loser
 *  cancel, a net denominator goes to zero and every share explodes. */
export function dayContribution(rows) {
  const held = positions(rows).filter((r) => typeof r.dayPnlDisplay === 'number')
  const gross = held.reduce((s, r) => s + Math.abs(r.dayPnlDisplay), 0)
  return held
    .map((r) => ({
      symbol: r.symbol,
      pnl: r.dayPnlDisplay,
      dayPct: r.dayPct ?? null,
      sharePct: gross > 0 ? (Math.abs(r.dayPnlDisplay) / gross) * 100 : null,
    }))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
}

/** How much of the book is sitting in cash rather than at risk. */
export function cashSplit(rows) {
  const all = priced(rows)
  const cash = all.filter((r) => r.kind === 'cash').reduce((s, r) => s + r.valueDisplay, 0)
  const invested = all.filter((r) => r.kind !== 'cash').reduce((s, r) => s + r.valueDisplay, 0)
  const total = cash + invested
  return { cash, invested, total, cashPct: total > 0 ? (cash / total) * 100 : null }
}

/** Positive capital grouped the way the portfolio reader talks about it:
 *  mainland A-shares together, Hong Kong together, every other listing as
 *  one sleeve, and cash. A negative cash account is borrowing, not a slice
 *  of owned capital, so it never becomes a misleading positive segment. */
export function capitalMix(rows) {
  const values = { cn: 0, hk: 0, other: 0, cash: 0 }
  for (const r of priced(rows)) {
    if (!(r.valueDisplay > 0)) continue
    const key = r.kind === 'cash' ? 'cash'
      : /\.HK$/i.test(r.symbol) ? 'hk'
        : /\.(SS|SZ)$/i.test(r.symbol) ? 'cn' : 'other'
    values[key] += r.valueDisplay
  }
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)
  if (!(total > 0)) return []
  return ['cn', 'hk', 'other', 'cash']
    .filter((key) => values[key] > 0)
    .map((key) => ({ key, value: values[key], pct: (values[key] / total) * 100 }))
}

// Listing venue from the symbol itself. The sector buckets only know US
// large-caps, so a Hong Kong / mainland book files 85% of itself under
// "Other" and the sector card says nothing (Jeff's actual demo book,
// 2026-08-21). Where a name is LISTED is the split that book actually has.
const VENUE = {
  HK: 'Hong Kong', SS: 'Shanghai', SZ: 'Shenzhen',
  TO: 'Toronto', V: 'TSX Venture', NE: 'Cboe Canada',
  T: 'Tokyo', KS: 'Korea', KQ: 'KOSDAQ', TW: 'Taiwan', TWO: 'Taipei',
  L: 'London', PA: 'Paris', AS: 'Amsterdam', DE: 'Frankfurt', F: 'Frankfurt',
  MI: 'Milan', MC: 'Madrid', SW: 'Zurich', ST: 'Stockholm', CO: 'Copenhagen',
  SI: 'Singapore', AX: 'Australia', NS: 'India', BO: 'India', SA: 'Brazil',
}

/** Value by listing venue, biggest first. Cash is its own line — it is not
 *  listed anywhere. */
export function venueSplit(rows) {
  const out = new Map()
  for (const r of priced(rows)) {
    if (r.kind === 'cash') {
      out.set('Cash', (out.get('Cash') || 0) + r.valueDisplay)
      continue
    }
    const suffix = String(r.symbol || '').split('.')[1]
    const name = suffix ? (VENUE[suffix.toUpperCase()] || suffix.toUpperCase()) : 'United States'
    out.set(name, (out.get(name) || 0) + r.valueDisplay)
  }
  const total = [...out.values()].reduce((a, b) => a + b, 0)
  return [...out.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, pct: total > 0 ? (value / total) * 100 : null }))
}

/** Value by sector bucket, biggest first, plus how much of the INVESTED book
 *  no bucket claims. `buckets` is passed in, not imported — this module
 *  takes rows and nothing else. The buckets only know US large-caps, so a
 *  Hong Kong / mainland book files ~85% of itself under Other; a card that
 *  says that says nothing, and the page hides it on `unmappedShare`
 *  (Gordon, 2026-08-22). */
export function sectorSplit(rows, buckets) {
  const by = new Map()
  let unmapped = 0
  let invested = 0
  for (const r of priced(rows)) {
    if (r.kind === 'cash') {
      by.set('Cash', (by.get('Cash') || 0) + r.valueDisplay)
      continue
    }
    const b = (buckets || []).find((x) => x.symbols.includes(r.symbol))
    if (!b) unmapped += r.valueDisplay
    invested += r.valueDisplay
    const name = b ? b.name : 'Other'
    by.set(name, (by.get(name) || 0) + r.valueDisplay)
  }
  const total = [...by.values()].reduce((a, b) => a + b, 0)
  const entries = [...by.entries()].sort((a, b) => b[1] - a[1])
  return { entries, total, unmappedShare: invested > 0 ? unmapped / invested : 0 }
}

/** Holdings sorted by one column. `dir` is 'asc' | 'desc'; a null key or dir
 *  returns the rows untouched (insertion order is the default view).
 *  Unpriced cells (null) always sink to the bottom, whichever direction. */
export const SORTABLE = {
  symbol: (r) => r.symbol,
  ccy: (r) => r.ccy,
  shares: (r) => r.shares,
  cost: (r) => r.cost ?? null,
  price: (r) => r.price,
  day: (r) => r.dayPct,
  value: (r) => r.valueDisplay,
  weight: (r) => r.weightPct,
  unreal: (r) => r.unrealDisplay,
}
/** The resting order of a book: venues together (港股, then A股, then the
 *  rest), codes ascending inside each — how a HK/mainland statement reads
 *  (Gordon 2026-08-23: entry order mixed his venues together). Stable for
 *  rows that tie. */
export function venueOrder(rows) {
  const venue = (sym) => (/\.HK$/.test(sym) ? 0 : /\.(SS|SZ)$/.test(sym) ? 1 : 2)
  const code = (sym) => {
    const digits = /^(\d+)/.exec(sym)
    return digits ? Number(digits[1]) : Infinity
  }
  return [...rows].sort((a, b) => (
    venue(a.symbol) - venue(b.symbol)
    || code(a.symbol) - code(b.symbol)
    || String(a.symbol).localeCompare(String(b.symbol))
  ))
}

/** The resting rows cut into venue sections for display: [{key, rows}] in
 *  venue order, empty sections dropped. Keys: 'hk' | 'cn' | 'other'. */
export function venueGroups(rows) {
  const keyOf = (sym) => (/\.HK$/.test(sym) ? 'hk' : /\.(SS|SZ)$/.test(sym) ? 'cn' : 'other')
  const out = []
  for (const r of venueOrder(rows)) {
    const key = keyOf(r.symbol)
    if (out.at(-1)?.key !== key) out.push({ key, rows: [] })
    out.at(-1).rows.push(r)
  }
  return out
}

/** The total line for one listing section. It deliberately takes valued rows
 *  from the table rather than fetching or converting again, so a section can
 *  never disagree with the book's grand total. A percentage needs every
 *  priced row's day result; otherwise the raw, partial day P&L is all we can
 *  state honestly. */
export function venueSubtotal(rows) {
  const group = rows || []
  const valued = group.filter((r) => r?.valueDisplay != null)
  const value = valued.length ? valued.reduce((sum, r) => sum + r.valueDisplay, 0) : null
  const weightPct = valued.length
    ? valued.reduce((sum, r) => sum + (r.weightPct || 0), 0) : null
  const dayRows = valued.filter((r) => r.dayPnlDisplay != null)
  const dayPnl = dayRows.length ? dayRows.reduce((sum, r) => sum + r.dayPnlDisplay, 0) : null
  const dayBase = dayPnl != null && value != null ? value - dayPnl : null
  const dayPct = dayRows.length === valued.length && dayBase ? (dayPnl / dayBase) * 100 : null
  const unrealRows = valued.filter((r) => r.unrealDisplay != null)
  const unrealPnl = unrealRows.length ? unrealRows.reduce((sum, r) => sum + r.unrealDisplay, 0) : null
  return { count: group.length, pricedCount: valued.length, value, weightPct, dayPnl, dayPct, unrealPnl }
}

export function sortRows(rows, key, dir) {
  const get = SORTABLE[key]
  if (!get || !dir) return venueOrder(rows)
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = get(a); const y = get(b)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    if (typeof x === 'string') return sign * x.localeCompare(y)
    return sign * (x - y)
  })
}
