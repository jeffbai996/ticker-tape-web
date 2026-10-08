// Why a book may not silently get smaller (Jeff 2026-08-23: "make sure we
// don't accidentally drop his entire portfolio"). The likeliest wipe is our
// own client bug — a corrupt localStorage read marks every book deleted and
// the next sync pushes the emptiness with a perfectly valid revision. So the
// store refuses any write that loses a portfolio, or more than a third of the
// holdings, unless the client declares the write came from the person
// pressing delete. Pure: (previous data, next data) -> reason or ''.

export const HISTORY_KEEP = 30
export const HOLDINGS_DROP_MAX = 0.3

function counts(data) {
  const books = Array.isArray(data?.portfolios) ? data.portfolios : []
  return {
    portfolios: books.length,
    holdings: books.reduce((n, p) => n + (Array.isArray(p.holdings) ? p.holdings.length : 0), 0),
  }
}

export function docCounts(data) {
  return counts(data)
}

export function shrinkReason(prev, next) {
  if (prev == null) return ''
  const a = counts(prev)
  const b = counts(next)
  if (b.portfolios < a.portfolios) return 'fewer portfolios'
  if (a.holdings > 0 && (a.holdings - b.holdings) / a.holdings > HOLDINGS_DROP_MAX) return 'fewer holdings'
  return ''
}

/** Which document kinds carry the guard. Watchlists are cheap to rebuild;
 *  only the portfolio book gets it. */
export const GUARDED_PREFIXES = new Set(['myportfolios:'])
